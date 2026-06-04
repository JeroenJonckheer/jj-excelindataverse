/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  DataverseService,
  escapeODataString,
  isTransientError,
  type BatchOp,
} from "../Spreadsheet/services/DataverseService";
import type { ColumnDef, PendingEdit } from "../Spreadsheet/services/types";

function col(partial: Partial<ColumnDef>): ColumnDef {
  return {
    name: "c",
    displayName: "C",
    dataType: "SingleLine.Text",
    kind: "text",
    editable: true,
    required: "none",
    ...partial,
  };
}

interface FetchRoute {
  match: string;
  body: unknown;
}

// Wraps attribute metadata the way the batched per-cast query returns it:
// a `value` array of attributes indexed by their logical name.
function attr(logicalName: string, fields: Record<string, unknown>) {
  return { value: [{ LogicalName: logicalName, ...fields }] };
}

function mockFetch(routes: FetchRoute[]) {
  return jest.fn((url: string) => {
    const route = routes.find((r) => url.includes(r.match));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(route ? route.body : {}),
      text: () => Promise.resolve(""),
    });
  });
}

function makeContext(webApi: Partial<ComponentFramework.WebApi>) {
  return {
    webAPI: webApi,
    page: { getClientUrl: () => "https://org.crm4.dynamics.com" },
  } as unknown as ComponentFramework.Context<{ records: ComponentFramework.PropertyTypes.DataSet; pageSize: ComponentFramework.PropertyTypes.WholeNumberProperty }>;
}

describe("escapeODataString", () => {
  it("doubles single quotes", () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
  });
});

describe("transient retry", () => {
  const edits = [
    { recordId: "id", columnName: "name", kind: "text" as const, value: "x", display: "x" },
  ];

  it("distinguishes transient from deterministic errors", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError(new Error("The connection was aborted"))).toBe(true);
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError(new Error("Required field missing"))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });

  it("retries an update on a transient error, then succeeds", async () => {
    const updateRecord = jest
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({});
    const svc = new DataverseService(makeContext({ updateRecord }));
    await svc.saveRecord("account", "id", edits);
    expect(updateRecord).toHaveBeenCalledTimes(2);
  });

  it("does not retry an update on a deterministic error", async () => {
    const updateRecord = jest.fn().mockRejectedValue({ status: 400 });
    const svc = new DataverseService(makeContext({ updateRecord }));
    await expect(svc.saveRecord("account", "id", edits)).rejects.toBeDefined();
    expect(updateRecord).toHaveBeenCalledTimes(1);
  });

  it("never retries create, to avoid duplicate records", async () => {
    const createRecord = jest.fn().mockRejectedValue({ status: 503 });
    const svc = new DataverseService(makeContext({ createRecord }));
    await expect(svc.createRecord("account", edits)).rejects.toBeDefined();
    expect(createRecord).toHaveBeenCalledTimes(1);
  });
});

describe("savePersonalView", () => {
  it("creates a userquery with fetchxml and layoutxml", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions",
        body: {
          PrimaryNameAttribute: "name",
          PrimaryIdAttribute: "accountid",
          EntitySetName: "accounts",
          ObjectTypeCode: 1,
        },
      },
    ]) as unknown as typeof fetch;
    const createRecord = jest.fn(() => Promise.resolve({ id: "v1" } as never));
    const svc = new DataverseService(makeContext({ createRecord }));

    await svc.savePersonalView(
      "account",
      "My layout",
      [
        { name: "name", width: 200 },
        { name: "telephone1", width: 120 },
      ],
      [{ name: "name", descending: false }],
    );

    expect(createRecord).toHaveBeenCalledTimes(1);
    const [entity, payload] = createRecord.mock.calls[0] as unknown as [
      string,
      Record<string, string | number>,
    ];
    expect(entity).toBe("userquery");
    expect(payload.name).toBe("My layout");
    expect(payload.returnedtypecode).toBe("account");
    expect(payload.querytype).toBe(0);
    expect(payload.fetchxml).toContain('<entity name="account">');
    expect(payload.fetchxml).toContain('<attribute name="name" />');
    expect(payload.fetchxml).toContain('<order attribute="name" descending="false" />');
    expect(payload.layoutxml).toContain('object="1"');
    expect(payload.layoutxml).toContain('<cell name="name" width="200" />');
    expect(payload.layoutxml).toContain('<cell name="telephone1" width="120" />');
  });
});

describe("enrichColumns", () => {
  it("reads string metadata into the column", async () => {
    global.fetch = mockFetch([
      {
        match: "StringAttributeMetadata",
        body: attr("name", { MaxLength: 120, RequiredLevel: { Value: "ApplicationRequired" } }),
      },
    ]) as unknown as typeof fetch;

    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "name", kind: "text" }),
    ]);
    expect(enriched.maxLength).toBe(120);
    expect(enriched.required).toBe("required");
  });

  it("marks a calculated/rollup column read-only (IsValidForUpdate false)", async () => {
    global.fetch = mockFetch([
      {
        match: "DecimalAttributeMetadata",
        body: attr("calculatedscore", { RequiredLevel: { Value: "None" }, IsValidForUpdate: false }),
      },
    ]) as unknown as typeof fetch;

    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "calculatedscore", kind: "number", dataType: "Decimal" }),
    ]);
    expect(enriched.editable).toBe(false);
  });

  it("keeps a normal column editable (IsValidForUpdate true)", async () => {
    global.fetch = mockFetch([
      {
        match: "DecimalAttributeMetadata",
        body: attr("score", { RequiredLevel: { Value: "None" }, IsValidForUpdate: true }),
      },
    ]) as unknown as typeof fetch;

    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "score", kind: "number", dataType: "Decimal" }),
    ]);
    expect(enriched.editable).toBe(true);
  });

  it("reads the choice default value (DefaultFormValue)", async () => {
    global.fetch = mockFetch([
      {
        match: "PicklistAttributeMetadata",
        body: attr("statuscode", {
          RequiredLevel: { Value: "None" },
          DefaultFormValue: 2,
          OptionSet: { Options: [] },
        }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "statuscode", kind: "choice" }),
    ]);
    expect(enriched.defaultValue).toBe(2);
  });

  it("treats a DefaultFormValue of -1 as no default", async () => {
    global.fetch = mockFetch([
      {
        match: "PicklistAttributeMetadata",
        body: attr("statuscode", {
          RequiredLevel: { Value: "None" },
          DefaultFormValue: -1,
          OptionSet: { Options: [] },
        }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "statuscode", kind: "choice" }),
    ]);
    expect(enriched.defaultValue).toBeUndefined();
  });

  it("reads the boolean default value", async () => {
    global.fetch = mockFetch([
      {
        match: "BooleanAttributeMetadata",
        body: attr("isvip", { RequiredLevel: { Value: "None" }, DefaultValue: true, OptionSet: {} }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "isvip", kind: "boolean", dataType: "TwoOptions" }),
    ]);
    expect(enriched.defaultValue).toBe(true);
  });

  it("reads choice options", async () => {
    global.fetch = mockFetch([
      {
        match: "PicklistAttributeMetadata",
        body: attr("statuscode", {
          RequiredLevel: { Value: "None" },
          OptionSet: {
            Options: [
              { Value: 1, Label: { UserLocalizedLabel: { Label: "Open" } } },
              { Value: 2, Label: { UserLocalizedLabel: { Label: "Closed" } } },
            ],
          },
        }),
      },
    ]) as unknown as typeof fetch;

    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "statuscode", kind: "choice" }),
    ]);
    expect(enriched.options).toEqual([
      { value: 1, label: "Open" },
      { value: 2, label: "Closed" },
    ]);
  });

  it("reads decimal number metadata (min, max, precision)", async () => {
    global.fetch = mockFetch([
      {
        match: "DecimalAttributeMetadata",
        body: attr("rate", { MinValue: 0, MaxValue: 100, Precision: 2, RequiredLevel: { Value: "None" } }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "rate", kind: "number", dataType: "Decimal" }),
    ]);
    expect(enriched.minValue).toBe(0);
    expect(enriched.maxValue).toBe(100);
    expect(enriched.precision).toBe(2);
  });

  it("defaults whole-number precision to zero", async () => {
    global.fetch = mockFetch([
      {
        match: "IntegerAttributeMetadata",
        body: attr("count", { RequiredLevel: { Value: "SystemRequired" } }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "count", kind: "number", dataType: "Whole.None" }),
    ]);
    expect(enriched.precision).toBe(0);
    expect(enriched.required).toBe("required");
  });

  it("reads currency and floating point via their metadata types", async () => {
    global.fetch = mockFetch([
      { match: "MoneyAttributeMetadata", body: attr("revenue", { MinValue: 0, RequiredLevel: { Value: "None" } }) },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [money] = await svc.enrichColumns("account", [
      col({ name: "revenue", kind: "number", dataType: "Currency" }),
    ]);
    expect(money.minValue).toBe(0);

    global.fetch = mockFetch([
      { match: "DoubleAttributeMetadata", body: attr("ratio", { MaxValue: 9, RequiredLevel: { Value: "Recommended" } }) },
    ]) as unknown as typeof fetch;
    const [dbl] = await svc.enrichColumns("account", [
      col({ name: "ratio", kind: "number", dataType: "FP" }),
    ]);
    expect(dbl.maxValue).toBe(9);
    expect(dbl.required).toBe("recommended");
  });

  it("reads boolean option labels", async () => {
    global.fetch = mockFetch([
      {
        match: "BooleanAttributeMetadata",
        body: attr("isactive", {
          RequiredLevel: { Value: "None" },
          OptionSet: {
            TrueOption: { Label: { UserLocalizedLabel: { Label: "Active" } } },
            FalseOption: { Label: { UserLocalizedLabel: { Label: "Inactive" } } },
          },
        }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "isactive", kind: "boolean" }),
    ]);
    expect(enriched.options).toEqual([
      { value: 0, label: "Inactive" },
      { value: 1, label: "Active" },
    ]);
  });

  it("reads lookup targets", async () => {
    global.fetch = mockFetch([
      {
        match: "LookupAttributeMetadata",
        body: attr("primarycontactid", { Targets: ["contact", "account"], RequiredLevel: { Value: "None" } }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "primarycontactid", kind: "lookup" }),
    ]);
    expect(enriched.lookupTargets).toEqual(["contact", "account"]);
  });

  it("reads required level for date columns", async () => {
    global.fetch = mockFetch([
      {
        match: "DateTimeAttributeMetadata",
        body: attr("duedate", { RequiredLevel: { Value: "ApplicationRequired" } }),
      },
    ]) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const [enriched] = await svc.enrichColumns("account", [
      col({ name: "duedate", kind: "date", dataType: "DateAndTime.DateOnly" }),
    ]);
    expect(enriched.required).toBe("required");
  });

  it("keeps the original column when metadata reads fail", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    const original = col({ name: "name", kind: "text" });
    const [enriched] = await svc.enrichColumns("account", [original]);
    expect(enriched.name).toBe("name");
  });

  it("does not enrich read-only columns", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({}));
    await svc.enrichColumns("account", [col({ name: "x", kind: "readonly", editable: false })]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("searchLookup", () => {
  it("queries each target and maps results", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions(LogicalName='account')",
        body: {
          PrimaryNameAttribute: "name",
          PrimaryIdAttribute: "accountid",
          EntitySetName: "accounts",
        },
      },
    ]) as unknown as typeof fetch;

    const retrieveMultipleRecords = jest.fn(() =>
      Promise.resolve({
        entities: [{ accountid: "1", name: "Acme" }],
        nextLink: "",
      }),
    );
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    const results = await svc.searchLookup(["account"], "Ac");
    expect(results).toEqual([{ id: "1", name: "Acme", entityType: "account" }]);
    expect(retrieveMultipleRecords).toHaveBeenCalled();
  });
});

describe("openRecord", () => {
  it("opens a record through context.navigation", () => {
    const openForm = jest.fn();
    const ctx = {
      webAPI: {},
      page: { getClientUrl: () => "" },
      navigation: { openForm },
    } as unknown as ComponentFramework.Context<{
      records: ComponentFramework.PropertyTypes.DataSet;
      pageSize: ComponentFramework.PropertyTypes.WholeNumberProperty;
    }>;
    new DataverseService(ctx).openRecord("account", "r1");
    expect(openForm).toHaveBeenCalledWith({ entityName: "account", entityId: "r1" });
  });

  it("falls back to Xrm.Navigation when context navigation is absent", () => {
    const openForm = jest.fn();
    (window as unknown as { Xrm?: unknown }).Xrm = { Navigation: { openForm } };
    new DataverseService(makeContext({})).openRecord("account", "r2");
    expect(openForm).toHaveBeenCalledWith({ entityName: "account", entityId: "r2" });
    delete (window as unknown as { Xrm?: unknown }).Xrm;
  });
});

describe("resolveLookup", () => {
  it("resolves a record by exact primary name", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions(LogicalName='contact')",
        body: {
          PrimaryNameAttribute: "fullname",
          PrimaryIdAttribute: "contactid",
          EntitySetName: "contacts",
        },
      },
    ]) as unknown as typeof fetch;
    const retrieveMultipleRecords = jest.fn(() =>
      Promise.resolve({ entities: [{ contactid: "1", fullname: "Jane Doe" }] }),
    );
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    const res = await svc.resolveLookup(["contact"], "Jane Doe");
    expect(res).toEqual([{ id: "1", name: "Jane Doe", entityType: "contact" }]);
  });

  it("returns no match for unknown text", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions",
        body: {
          PrimaryNameAttribute: "fullname",
          PrimaryIdAttribute: "contactid",
          EntitySetName: "contacts",
        },
      },
    ]) as unknown as typeof fetch;
    const retrieveMultipleRecords = jest.fn(() => Promise.resolve({ entities: [] }));
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    expect(await svc.resolveLookup(["contact"], "Nobody")).toEqual([]);
  });

  it("resolves leniently across casing and extra whitespace", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions",
        body: {
          PrimaryNameAttribute: "name",
          PrimaryIdAttribute: "accountid",
          EntitySetName: "accounts",
        },
      },
    ]) as unknown as typeof fetch;
    const retrieveMultipleRecords = jest.fn(() =>
      Promise.resolve({
        entities: [
          { accountid: "a1", name: "Helix Group" },
          { accountid: "a2", name: "Helix Group BV" },
        ],
      }),
    );
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    const res = await svc.resolveLookup(["account"], "  helix   group ");
    expect(res).toEqual([{ id: "a1", name: "Helix Group", entityType: "account" }]);
  });

  it("collapses newlines and tabs in a pasted value before querying", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions",
        body: {
          PrimaryNameAttribute: "name",
          PrimaryIdAttribute: "accountid",
          EntitySetName: "accounts",
        },
      },
    ]) as unknown as typeof fetch;
    const retrieveMultipleRecords = jest.fn((_entity: string, _query: string) =>
      Promise.resolve({ entities: [{ accountid: "a1", name: "Helix Group" }] }),
    );
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    const res = await svc.resolveLookup(["account"], "Helix\n  Group");
    expect(res).toEqual([{ id: "a1", name: "Helix Group", entityType: "account" }]);
    // The query must use the collapsed term, not the raw newline value.
    expect(retrieveMultipleRecords.mock.calls[0][1]).toContain(
      "contains(name,'Helix Group')",
    );
  });

  it("returns empty for blank text without querying", async () => {
    const retrieveMultipleRecords = jest.fn();
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    expect(await svc.resolveLookup(["contact"], "   ")).toEqual([]);
    expect(retrieveMultipleRecords).not.toHaveBeenCalled();
  });

  it("does not cache a failed lookup, so a later retry can resolve it", async () => {
    global.fetch = mockFetch([
      {
        match: "EntityDefinitions",
        body: {
          PrimaryNameAttribute: "name",
          PrimaryIdAttribute: "accountid",
          EntitySetName: "accounts",
        },
      },
    ]) as unknown as typeof fetch;
    let calls = 0;
    const retrieveMultipleRecords = jest.fn(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("throttled"))
        : Promise.resolve({ entities: [{ accountid: "a1", name: "Helix Group" }] });
    });
    const svc = new DataverseService(
      makeContext({ retrieveMultipleRecords } as unknown as Partial<ComponentFramework.WebApi>),
    );
    // First attempt errors -> empty, but must NOT be cached.
    expect(await svc.resolveLookup(["account"], "Helix Group")).toEqual([]);
    // Retry hits the API again and resolves.
    expect(await svc.resolveLookup(["account"], "Helix Group")).toEqual([
      { id: "a1", name: "Helix Group", entityType: "account" },
    ]);
    expect(retrieveMultipleRecords).toHaveBeenCalledTimes(2);
  });
});

describe("writeBatch", () => {
  const METABODY = {
    EntitySetName: "contacts",
    PrimaryNameAttribute: "fullname",
    PrimaryIdAttribute: "contactid",
    ObjectTypeCode: 2,
  };
  const edit = (recordId: string, value: string): PendingEdit => ({
    recordId,
    columnName: "fullname",
    kind: "text",
    value,
    display: value,
  });

  it("maps the ordered sub-responses back to each operation", async () => {
    const resp = [
      "--b",
      "Content-Type: multipart/mixed; boundary=cs",
      "",
      "--cs",
      "Content-Type: application/http",
      "",
      "HTTP/1.1 204 No Content",
      "",
      "--cs--",
      "--b",
      "Content-Type: multipart/mixed; boundary=cs",
      "",
      "--cs",
      "Content-Type: application/http",
      "",
      "HTTP/1.1 201 Created",
      "",
      "--cs--",
      "--b",
      "Content-Type: multipart/mixed; boundary=cs",
      "",
      "--cs",
      "Content-Type: application/http",
      "",
      "HTTP/1.1 400 Bad Request",
      "Content-Type: application/json",
      "",
      '{"error":{"code":"x","message":"Business rule: nope"}}',
      "--cs--",
      "--b--",
    ].join("\r\n");
    const fetchMock = jest.fn((url: string, init?: { body?: string }) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(METABODY),
        text: () => Promise.resolve(String(url).includes("/$batch") ? resp : ""),
        __body: init?.body,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({} as Partial<ComponentFramework.WebApi>));
    const ops: BatchOp[] = [
      { recordId: "r1", kind: "update", edits: [edit("r1", "A")] },
      { recordId: "tmp1", kind: "create", edits: [edit("tmp1", "B")] },
      { recordId: "r2", kind: "delete" },
    ];
    const results = await svc.writeBatch("contact", ops);
    expect(results).toEqual([
      { recordId: "r1", ok: true },
      { recordId: "tmp1", ok: true },
      { recordId: "r2", ok: false, error: "Business rule: nope" },
    ]);
    const batchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/$batch"));
    expect(batchCalls.length).toBe(1);
    const body = String((batchCalls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toContain("PATCH ");
    expect(body).toContain("POST ");
    expect(body).toContain("DELETE ");
  });

  it("chunks more than 100 operations into multiple $batch requests", async () => {
    const fetchMock = jest.fn((url: string, init?: { body?: string }) => {
      if (String(url).includes("/$batch")) {
        const n = (String(init?.body).match(/Content-ID:/g) || []).length;
        const text = Array.from({ length: n }, () => "HTTP/1.1 204 No Content").join("\r\n");
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve(text) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(METABODY), text: () => Promise.resolve("") });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new DataverseService(makeContext({} as Partial<ComponentFramework.WebApi>));
    const ops: BatchOp[] = Array.from({ length: 150 }, (_, i) => ({ recordId: `r${i}`, kind: "delete" as const }));
    const results = await svc.writeBatch("contact", ops);
    expect(results.length).toBe(150);
    expect(results.every((r) => r.ok)).toBe(true);
    const batchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/$batch"));
    expect(batchCalls.length).toBe(2);
  });
});

describe("saveRecord", () => {
  it("writes plain values and ISO dates", async () => {
    const updateRecord = jest.fn(
      (_entity: string, _id: string, _data: Record<string, unknown>) =>
        Promise.resolve({ entityType: "account", id: "r1", name: "" }),
    );
    const svc = new DataverseService(
      makeContext({ updateRecord } as unknown as Partial<ComponentFramework.WebApi>),
    );
    const edits: PendingEdit[] = [
      { recordId: "r1", columnName: "name", kind: "text", value: "Acme", display: "Acme" },
      {
        recordId: "r1",
        columnName: "createdon",
        kind: "date",
        value: new Date(Date.UTC(2026, 0, 2)),
        display: "2026-01-02",
      },
    ];
    await svc.saveRecord("account", "r1", edits);
    const payload = updateRecord.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.name).toBe("Acme");
    expect(payload.createdon).toBe("2026-01-02T00:00:00.000Z");
  });

  it("creates a record from new-row edits", async () => {
    const createRecord = jest.fn(
      (_entity: string, _data: Record<string, unknown>) =>
        Promise.resolve({ entityType: "account", id: "new1", name: "" }),
    );
    const svc = new DataverseService(
      makeContext({ createRecord } as unknown as Partial<ComponentFramework.WebApi>),
    );
    await svc.createRecord("account", [
      { recordId: "new-1", columnName: "name", kind: "text", value: "Fresh Co", display: "Fresh Co" },
    ]);
    const payload = createRecord.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.name).toBe("Fresh Co");
  });

  it("binds a lookup via its navigation property", async () => {
    global.fetch = mockFetch([
      {
        match: "ManyToOneRelationships",
        body: {
          value: [
            {
              ReferencingEntityNavigationPropertyName: "primarycontactid",
              ReferencedEntity: "contact",
            },
          ],
        },
      },
      {
        match: "EntityDefinitions(LogicalName='contact')",
        body: {
          PrimaryNameAttribute: "fullname",
          PrimaryIdAttribute: "contactid",
          EntitySetName: "contacts",
        },
      },
    ]) as unknown as typeof fetch;

    const updateRecord = jest.fn(
      (_entity: string, _id: string, _data: Record<string, unknown>) =>
        Promise.resolve({ entityType: "account", id: "r1", name: "" }),
    );
    const svc = new DataverseService(
      makeContext({ updateRecord } as unknown as Partial<ComponentFramework.WebApi>),
    );
    await svc.saveRecord("account", "r1", [
      {
        recordId: "r1",
        columnName: "primarycontactid",
        kind: "lookup",
        value: { id: "c1", name: "Jane", entityType: "contact" },
        display: "Jane",
      },
    ]);
    const payload = updateRecord.mock.calls[0][2] as Record<string, unknown>;
    expect(payload["primarycontactid@odata.bind"]).toBe("/contacts(c1)");
  });

  it("deletes a record via the web API", async () => {
    const deleteRecord = jest.fn(() =>
      Promise.resolve({ entityType: "account", id: "r1", name: "" }),
    );
    const svc = new DataverseService(
      makeContext({ deleteRecord } as unknown as Partial<ComponentFramework.WebApi>),
    );
    await svc.deleteRecord("account", "r1");
    expect(deleteRecord).toHaveBeenCalledWith("account", "r1");
  });

  it("clears a lookup with a null bind", async () => {
    global.fetch = mockFetch([
      {
        match: "ManyToOneRelationships",
        body: {
          value: [
            {
              ReferencingEntityNavigationPropertyName: "primarycontactid",
              ReferencedEntity: "contact",
            },
          ],
        },
      },
    ]) as unknown as typeof fetch;
    const updateRecord = jest.fn(
      (_entity: string, _id: string, _data: Record<string, unknown>) =>
        Promise.resolve({ entityType: "account", id: "r1", name: "" }),
    );
    const svc = new DataverseService(
      makeContext({ updateRecord } as unknown as Partial<ComponentFramework.WebApi>),
    );
    await svc.saveRecord("account", "r1", [
      {
        recordId: "r1",
        columnName: "primarycontactid",
        kind: "lookup",
        value: null,
        display: "",
      },
    ]);
    const payload = updateRecord.mock.calls[0][2] as Record<string, unknown>;
    expect(payload["primarycontactid@odata.bind"]).toBeNull();
  });
});

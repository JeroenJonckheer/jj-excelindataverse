/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  buildColumns,
  buildRows,
  extractRawValue,
  type DatasetColumnLike,
  type DatasetRecordLike,
} from "../Spreadsheet/services/dataset";
import type { ColumnDef } from "../Spreadsheet/services/types";

function record(values: Record<string, unknown>, formatted: Record<string, string>): DatasetRecordLike {
  return {
    getRecordId: () => "r1",
    getValue: (c) => values[c],
    getFormattedValue: (c) => formatted[c] ?? "",
  };
}

function col(name: string, kind: ColumnDef["kind"], extra: Partial<ColumnDef> = {}): ColumnDef {
  return {
    name,
    displayName: name,
    dataType: "SingleLine.Text",
    kind,
    editable: true,
    required: "none",
    ...extra,
  };
}

describe("buildColumns", () => {
  it("orders columns and derives kinds", () => {
    const cols: DatasetColumnLike[] = [
      { name: "num", displayName: "Number", dataType: "Whole.None", order: 2 },
      { name: "name", displayName: "Name", dataType: "SingleLine.Text", order: 1 },
      { name: "look", displayName: "Owner", dataType: "Lookup.Simple", order: 3 },
    ];
    const built = buildColumns(cols);
    expect(built.map((c) => c.name)).toEqual(["name", "num", "look"]);
    expect(built[1].kind).toBe("number");
    expect(built[2].kind).toBe("lookup");
    expect(built[0].editable).toBe(true);
  });
  it("falls back to the logical name when there is no display name", () => {
    const built = buildColumns([
      { name: "field", displayName: "", dataType: "SingleLine.Text" },
    ]);
    expect(built[0].displayName).toBe("field");
  });
  it("de-duplicates columns that share a logical name", () => {
    const built = buildColumns([
      { name: "pp_name", displayName: "Account", dataType: "SingleLine.Text", order: 1 },
      { name: "pp_name", displayName: "pp_name", dataType: "SingleLine.Text", order: 2 },
      { name: "contact", displayName: "Contact", dataType: "SingleLine.Text", order: 3 },
    ]);
    expect(built.map((c) => c.name)).toEqual(["pp_name", "contact"]);
    expect(built[0].displayName).toBe("Account");
  });
  it("skips hidden columns", () => {
    const built = buildColumns([
      { name: "name", displayName: "Name", dataType: "SingleLine.Text", order: 1 },
      { name: "secret", displayName: "", dataType: "SingleLine.Text", order: 2, isHidden: true },
    ]);
    expect(built.map((c) => c.name)).toEqual(["name"]);
  });
  it("skips columns that are not on the view layout (order -1)", () => {
    const built = buildColumns([
      { name: "account", displayName: "Account", dataType: "SingleLine.Text", order: 0 },
      { name: "pp_name", displayName: "name", dataType: "SingleLine.Text", order: -1 },
    ]);
    expect(built.map((c) => c.name)).toEqual(["account"]);
  });
});

describe("extractRawValue", () => {
  it("reads numbers, booleans and choices", () => {
    const rec = record({ n: 5, b: true, c: 2 }, {});
    expect(extractRawValue(rec, col("n", "number"))).toBe(5);
    expect(extractRawValue(rec, col("b", "boolean"))).toBe(true);
    expect(extractRawValue(rec, col("c", "choice"))).toBe(2);
  });
  it("reads dates", () => {
    const d = new Date(2026, 1, 2);
    const rec = record({ d }, {});
    expect(extractRawValue(rec, col("d", "date"))).toEqual(d);
  });
  it("reads a lookup reference with a guid object id", () => {
    const rec = record(
      { owner: { id: { guid: "abc" }, name: "Jeroen", etn: "systemuser" } },
      {},
    );
    const value = extractRawValue(rec, col("owner", "lookup"));
    expect(value).toEqual({ id: "abc", name: "Jeroen", entityType: "systemuser" });
  });
  it("reads a lookup reference returned as an array", () => {
    const rec = record(
      { owner: [{ id: "xyz", name: "Acme", etn: "account" }] },
      {},
    );
    const value = extractRawValue(rec, col("owner", "lookup"));
    expect(value).toEqual({ id: "xyz", name: "Acme", entityType: "account" });
  });
  it("parses a comma separated multi-choice string", () => {
    const rec = record({ m: "1,2,3" }, {});
    expect(extractRawValue(rec, col("m", "multichoice"))).toEqual([1, 2, 3]);
  });
  it("returns null for empty values", () => {
    const rec = record({ x: null }, {});
    expect(extractRawValue(rec, col("x", "text"))).toBeNull();
  });
});

describe("buildRows", () => {
  it("builds rows of raw and display values", () => {
    const rec = record({ name: "Acme", num: 10 }, { name: "Acme", num: "10" });
    const records: Record<string, DatasetRecordLike> = { r1: rec };
    const cols = [col("name", "text"), col("num", "number")];
    const rows = buildRows(["r1"], records, cols);
    expect(rows).toHaveLength(1);
    expect(rows[0].recordId).toBe("r1");
    expect(rows[0].raw.num).toBe(10);
    expect(rows[0].display.name).toBe("Acme");
  });
  it("skips ids without a matching record", () => {
    const rows = buildRows(["missing"], {}, [col("name", "text")]);
    expect(rows).toHaveLength(0);
  });
});

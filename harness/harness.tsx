/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 *
 * Offline harness that mounts the real control with a mocked dataset context
 * and a deterministic Dataverse service. It backs both the Playwright e2e tests
 * and the demo recording, with no network access required.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { App } from "../Spreadsheet/components/App";
import type { IInputs } from "../Spreadsheet/generated/ManifestTypes";
import type {
  CellValue,
  ColumnDef,
  LookupValue,
  PendingEdit,
} from "../Spreadsheet/services/types";
import type { IDataverseService } from "../Spreadsheet/services/DataverseService";
import { formatValue } from "../Spreadsheet/services/format";

const META: ColumnDef[] = [
  {
    name: "name",
    displayName: "Account",
    dataType: "SingleLine.Text",
    kind: "text",
    editable: true,
    required: "required",
    maxLength: 100,
  },
  {
    name: "email",
    displayName: "Email",
    dataType: "SingleLine.Email",
    kind: "text",
    editable: true,
    required: "none",
    format: "email",
    maxLength: 100,
  },
  {
    name: "score",
    displayName: "Score",
    dataType: "Decimal",
    kind: "number",
    editable: true,
    required: "none",
    minValue: 0,
    maxValue: 100,
    precision: 1,
  },
  {
    name: "status",
    displayName: "Status",
    dataType: "OptionSet",
    kind: "choice",
    editable: true,
    required: "none",
    defaultValue: 1,
    options: [
      { value: 1, label: "Lead" },
      { value: 2, label: "Qualified" },
      { value: 3, label: "Won" },
      { value: 4, label: "Lost" },
    ],
  },
  {
    name: "active",
    displayName: "Active",
    dataType: "TwoOptions",
    kind: "boolean",
    editable: true,
    required: "none",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" },
    ],
  },
  {
    name: "duedate",
    displayName: "Close date",
    dataType: "DateAndTime.DateOnly",
    kind: "date",
    editable: true,
    required: "none",
  },
  {
    name: "owner",
    displayName: "Owner",
    dataType: "Lookup.Simple",
    kind: "lookup",
    editable: true,
    required: "none",
    lookupTargets: ["contact"],
  },
  {
    // A calculated/rollup-style column: read-only, like a field whose metadata
    // reports IsValidForUpdate = false.
    name: "forecast",
    displayName: "Forecast",
    dataType: "Currency",
    kind: "number",
    editable: false,
    required: "none",
  },
];

const COL_BY_NAME = new Map(META.map((c) => [c.name, c]));

const CONTACTS: LookupValue[] = [
  { id: "c1", name: "Jane Doe", entityType: "contact" },
  { id: "c2", name: "John Roe", entityType: "contact" },
  { id: "c3", name: "Mary Major", entityType: "contact" },
  { id: "c4", name: "Richard Miles", entityType: "contact" },
];

type Store = Record<string, Record<string, CellValue>>;

function initialStore(): Store {
  return {
    r1: {
      name: "Acme Corporation",
      email: "sales@acme.example",
      score: 72.5,
      status: 2,
      active: true,
      duedate: new Date(2026, 5, 15),
      owner: CONTACTS[0],
      forecast: 72500,
    },
    r2: {
      name: "Globex",
      email: "hello@globex.example",
      score: 40,
      status: 1,
      active: false,
      duedate: new Date(2026, 6, 1),
      owner: CONTACTS[1],
      forecast: 40000,
    },
    r3: {
      name: "Initech",
      email: "info@initech.example",
      score: 88,
      status: 3,
      active: true,
      duedate: new Date(2026, 4, 20),
      owner: CONTACTS[2],
      forecast: 88000,
    },
    r4: {
      name: "Hooli",
      email: "team@hooli.example",
      score: 15,
      status: 4,
      active: false,
      duedate: new Date(2026, 7, 9),
      owner: CONTACTS[3],
      forecast: 15000,
    },
    r5: {
      name: "Stark Industries",
      email: "deals@stark.example",
      score: 64,
      status: 2,
      active: true,
      duedate: new Date(2026, 8, 2),
      owner: CONTACTS[0],
      forecast: 64000,
    },
  };
}

const ORDER = ["r1", "r2", "r3", "r4", "r5"];

function formattedValue(value: CellValue, column: ColumnDef): string {
  if (value === null || value === undefined) return "";
  if (column.kind === "text" || column.kind === "number") return String(value);
  return formatValue(value, column);
}

let sortState: { name: string; sortDirection: number }[] = [];

function sortableKey(value: CellValue): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "name" in value) return (value as LookupValue).name;
  if (typeof value === "number") return value;
  return String(value);
}

interface HarnessCondition {
  attributeName: string;
  conditionOperator: number;
  value: unknown;
}
let filterState: { conditions: HarnessCondition[] } | null = null;

function matchCondition(value: CellValue, op: number, condValue: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = value instanceof Date ? value.getTime() : typeof value === "boolean" ? (value ? 1 : 0) : value;
  switch (op) {
    case 6: // Like %x%
      return String(value)
        .toLowerCase()
        .includes(String(condValue).replace(/%/g, "").toLowerCase());
    case 0: // Equal
      return n === condValue;
    case 8: // In
      return Array.isArray(condValue) && condValue.includes(n);
    case 4: // GreaterEqual
      return typeof n === "number" && n >= Number(condValue);
    case 5: // LessEqual
      return typeof n === "number" && n <= Number(condValue);
    default:
      return true;
  }
}

function matchesFilter(row: Record<string, CellValue>): boolean {
  if (!filterState) return true;
  return filterState.conditions.every((c) =>
    matchCondition(row[c.attributeName] ?? null, c.conditionOperator, c.value),
  );
}

// Paging, so the harness can exercise the footer paging controls. The page size
// can be set from the URL (?pageSize=2) for the paging e2e test; it defaults to
// showing everything on one page so the other tests see all rows.
function readUrlPageSize(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get("pageSize"));
    return Number.isFinite(v) && v > 0 ? v : 100;
  } catch {
    return 100;
  }
}
let pageSize = readUrlPageSize();
let pageStart = 0;

function sortedOrder(store: Store): string[] {
  const ids = ORDER.filter((id) => matchesFilter(store[id]));
  const sort = sortState[0];
  if (!sort) return ids;
  ids.sort((a, b) => {
    const ka = sortableKey(store[a][sort.name] ?? null);
    const kb = sortableKey(store[b][sort.name] ?? null);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return sort.sortDirection === 1 ? -cmp : cmp;
  });
  return ids;
}

function buildContext(
  store: Store,
  force: () => void,
): ComponentFramework.Context<IInputs> {
  const records: Record<string, unknown> = {};
  for (const id of ORDER) {
    records[id] = {
      getRecordId: () => id,
      getValue: (c: string) => store[id][c] ?? null,
      getFormattedValue: (c: string) =>
        formattedValue(store[id][c] ?? null, COL_BY_NAME.get(c) as ColumnDef),
    };
  }
  // Pixel widths as a real view defines them, so the harness mirrors how the
  // grid honours the configured widths (and stretches to fill when there is
  // room). Deliberately varied so the proportions are visible.
  const COL_PX: Record<string, number> = {
    name: 240,
    email: 200,
    score: 90,
    status: 120,
    active: 80,
    duedate: 130,
    owner: 180,
    forecast: 120,
  };
  const allIds = sortedOrder(store);
  const visibleIds = allIds.slice(pageStart, pageStart + pageSize);
  const dataset = {
    columns: META.map((c, i) => ({
      name: c.name,
      displayName: c.displayName,
      dataType: c.dataType,
      order: i,
      visualSizeFactor: COL_PX[c.name] ?? 150,
    })),
    sortedRecordIds: visibleIds,
    records,
    sorting: [...sortState],
    paging: {
      pageSize,
      totalResultCount: allIds.length,
      hasNextPage: pageStart + pageSize < allIds.length,
      hasPreviousPage: pageStart > 0,
      loadNextPage: () => {
        pageStart += pageSize;
        force();
      },
      loadPreviousPage: () => {
        pageStart = Math.max(0, pageStart - pageSize);
        force();
      },
      setPageSize: (n: number) => {
        pageSize = n;
        pageStart = 0;
      },
      reset: () => {
        pageStart = 0;
      },
    },
    filtering: {
      setFilter: (f: { conditions: HarnessCondition[] }) => {
        filterState = f;
      },
      clearFilter: () => {
        filterState = null;
      },
      getFilter: () => filterState,
    },
    getTargetEntityType: () => "demo_account",
    refresh: () => {
      sortState = dataset.sorting || [];
      force();
    },
    setSelectedRecordIds: () => undefined,
    loading: false,
  };
  return {
    parameters: { records: dataset, pageSize: { raw: pageSize } },
    mode: { trackContainerResize: () => undefined, allocatedWidth: 1100 },
  } as unknown as ComponentFramework.Context<IInputs>;
}

function createService(store: Store): IDataverseService {
  return {
    enrichColumns: (_entity, columns) =>
      Promise.resolve(
        columns.map((c) => {
          const meta = COL_BY_NAME.get(c.name);
          return meta ? { ...c, ...meta, dataType: c.dataType, kind: c.kind } : c;
        }),
      ),
    searchLookup: (_targets, term) =>
      Promise.resolve(
        CONTACTS.filter((c) =>
          c.name.toLowerCase().includes(term.toLowerCase()),
        ),
      ),
    resolveLookup: (_targets, text) => {
      const term = text.trim().toLowerCase();
      if (term.length === 0) return Promise.resolve([]);
      const byId = CONTACTS.filter((c) => c.id.toLowerCase() === term);
      if (byId.length > 0) return Promise.resolve(byId);
      return Promise.resolve(
        CONTACTS.filter((c) => c.name.toLowerCase() === term),
      );
    },
    saveRecord: (_entity, recordId, edits: PendingEdit[]) => {
      // Mimic a server-side rejection (business rule / plugin) so the inline
      // error path can be exercised: refuse the sentinel name "REJECT".
      if (edits.some((e) => e.columnName === "name" && e.value === "REJECT")) {
        return Promise.reject({ message: "Server refused this record" });
      }
      for (const edit of edits) {
        store[recordId][edit.columnName] = edit.value;
      }
      return Promise.resolve();
    },
    createRecord: (_entity, edits: PendingEdit[]) => {
      const id = `demo-${ORDER.length + 1}`;
      store[id] = {};
      for (const edit of edits) {
        store[id][edit.columnName] = edit.value;
      }
      ORDER.push(id);
      return Promise.resolve();
    },
    deleteRecord: (_entity, recordId) => {
      const index = ORDER.indexOf(recordId);
      if (index >= 0) ORDER.splice(index, 1);
      delete store[recordId];
      return Promise.resolve();
    },
    openRecord: (_entity, recordId) => {
      // The harness has no host form; surface the intent for the demo and tests.
      console.info(`JJ - Excel in Dataverse: open record ${recordId}`);
    },
    savePersonalView: (_entity, name, columns, _sort) => {
      console.info(
        `JJ - Excel in Dataverse: saved personal view '${name}' with ${columns.length} columns`,
      );
      return Promise.resolve();
    },
  };
}

const Harness: React.FC = () => {
  const storeRef = React.useRef<Store>(initialStore());
  const serviceRef = React.useRef<IDataverseService>(createService(storeRef.current));
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  const context = buildContext(storeRef.current, force);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, background: "#f3f2f1" }}>
      <div
        style={{
          height: "100%",
          background: "#ffffff",
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <App context={context} onChange={force} service={serviceRef.current} />
      </div>
    </div>
  );
};

const root = document.getElementById("root");
if (root) {
  ReactDOM.render(<Harness />, root);
}

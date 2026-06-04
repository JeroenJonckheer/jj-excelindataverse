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

// ?firstcol=createdon reproduces "added a read-only Created On as the first
// column" - the scenario reported as blanking the whole sheet.
function readUrlFirstCol(): string {
  try {
    return new URLSearchParams(window.location.search).get("firstcol") ?? "";
  } catch {
    return "";
  }
}
if (readUrlFirstCol() === "createdon") {
  META.unshift({
    name: "createdon",
    displayName: "Created On",
    dataType: "DateAndTime.DateAndTime",
    kind: "datetime",
    editable: false,
    required: "none",
  });
}

const COL_BY_NAME = new Map(META.map((c) => [c.name, c]));

const CONTACTS: LookupValue[] = [
  { id: "c1", name: "Jane Doe", entityType: "contact" },
  { id: "c2", name: "John Roe", entityType: "contact" },
  { id: "c3", name: "Mary Major", entityType: "contact" },
  { id: "c4", name: "Richard Miles", entityType: "contact" },
];

type Store = Record<string, Record<string, CellValue>>;

function readUrlRows(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get("rows"));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function buildInitialStore(): Store {
  // ?rows=N generates N synthetic rows for the virtualization test.
  const n = readUrlRows();
  if (n > 0) {
    const store: Store = {};
    for (let i = 0; i < n; i++) {
      store[`syn${i}`] = {
        name: `Synthetic Account ${i}`,
        email: `row${i}@example.test`,
        score: i % 100,
        status: (i % 4) + 1,
        active: i % 2 === 0,
        duedate: null,
        owner: CONTACTS[i % CONTACTS.length],
        forecast: i * 100,
      };
    }
    return store;
  }
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

// Built once at module load; ORDER is derived from it (no per-render side
// effects). initialStore() returns a fresh mutable clone for the component.
const INITIAL_STORE = buildInitialStore();
if (readUrlFirstCol() === "createdon") {
  let day = 1;
  for (const k of Object.keys(INITIAL_STORE)) {
    INITIAL_STORE[k].createdon = new Date(2026, 0, ((day++ % 27) + 1));
  }
}
const ORDER: string[] = Object.keys(INITIAL_STORE);
function initialStore(): Store {
  const copy: Store = {};
  for (const k of Object.keys(INITIAL_STORE)) copy[k] = { ...INITIAL_STORE[k] };
  return copy;
}

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

// ?ghost=N simulates records deleted outside the control (e.g. the command bar):
// the dataset still hands back N already-loaded rows while reporting a lower
// total, until a refresh reconciles them. Reproduces the stale-rows bug.
function readUrlGhost(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get("ghost"));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}
// ?ghoststick keeps the discrepancy unresolved on refresh, so the control's
// self-heal must re-query at most once (no refresh storm) rather than loop.
function readUrlGhostStick(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("ghoststick") === "1";
  } catch {
    return false;
  }
}
let ghostCount = readUrlGhost();
const ghostStick = readUrlGhostStick();
let refreshCount = 0;
// ?healtest=1: the next column add makes the dataset hand back zero rows until a
// refresh restores them - the "blank grid after a column change" the self-heal
// must recover from.
let emptyUntilRefresh = false;

// Accumulating paging (like the Dataverse dataset): "load more" grows the loaded
// count rather than replacing the page.
let loadedCount = pageSize;

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
    createdon: 160,
  };
  const allIds = sortedOrder(store);
  const visibleIds = emptyUntilRefresh ? [] : allIds.slice(0, loadedCount);
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
      // Ghost rows are still handed back in sortedRecordIds but excluded from the
      // reported total, so loaded > total - the stale state a refresh resolves.
      // Capped at 5000 like the real Dataverse dataset, so the control must cope
      // with loaded == cap < real total on a large view.
      totalResultCount: Math.min(5000, Math.max(0, allIds.length - ghostCount)),
      hasNextPage: loadedCount < allIds.length,
      hasPreviousPage: false,
      loadNextPage: () => {
        loadedCount = Math.min(loadedCount + pageSize, allIds.length);
        force();
      },
      loadPreviousPage: () => undefined,
      setPageSize: (n: number) => {
        pageSize = n;
        loadedCount = n;
      },
      reset: () => {
        loadedCount = pageSize;
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
      emptyUntilRefresh = false; // a real re-query brings the rows back
      refreshCount++;
      (window as unknown as { __jjRefreshCount?: number }).__jjRefreshCount = refreshCount;
      // A real re-query reconciles ghost rows: the records deleted elsewhere are
      // gone for good once the dataset is re-read. In sticky mode it does not,
      // so the control's self-heal must not loop.
      if (ghostCount > 0 && !ghostStick) {
        for (let i = 0; i < ghostCount; i++) {
          const id = ORDER[ORDER.length - 1];
          if (id == null) break;
          ORDER.pop();
          delete store[id];
        }
        ghostCount = 0;
        loadedCount = pageSize;
      }
      force();
    },
    // The real host reacts to a selection change by re-running updateView with a
    // fresh dataset (new rows reference). Mirror that so the harness exercises a
    // re-render between two clicks - the path a Shift+click range relies on.
    setSelectedRecordIds: () => force(),
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
    writeBatch: (_entity, ops) => {
      // Mirror the per-record store mutations, with the same "REJECT" rejection
      // so the inline server-error path is exercised through the batch too.
      const rejects = (edits: PendingEdit[] | undefined) =>
        (edits ?? []).some((e) => e.columnName === "name" && e.value === "REJECT");
      const results = ops.map((op) => {
        if (op.kind === "delete") {
          const i = ORDER.indexOf(op.recordId);
          if (i >= 0) ORDER.splice(i, 1);
          delete store[op.recordId];
          return { recordId: op.recordId, ok: true };
        }
        if (rejects(op.edits)) {
          return { recordId: op.recordId, ok: false, error: "Server refused this record" };
        }
        if (op.kind === "create") {
          const id = `demo-${ORDER.length + 1}`;
          store[id] = {};
          for (const e of op.edits ?? []) store[id][e.columnName] = e.value;
          ORDER.push(id);
        } else {
          for (const e of op.edits ?? []) store[op.recordId][e.columnName] = e.value;
        }
        return { recordId: op.recordId, ok: true };
      });
      return Promise.resolve(results);
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

// ?addcol=1 shows a dev button that appends a column at runtime, mimicking the
// host's "Edit columns": the view's column set changes on an already-loaded
// (possibly large, virtualized) grid.
function readUrlAddCol(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("addcol") === "1";
  } catch {
    return false;
  }
}
function addDevColumn(): void {
  if (META.some((c) => c.name === "pp_devcol")) return;
  const col: ColumnDef = {
    name: "pp_devcol",
    displayName: "Dev Column",
    dataType: "DateAndTime.DateAndTime",
    kind: "datetime",
    editable: false,
    required: "none",
  };
  META.unshift(col); // add as the FIRST column, like the reported repro
  COL_BY_NAME.set(col.name, col);
}

const Harness: React.FC = () => {
  const storeRef = React.useRef<Store>(initialStore());
  const serviceRef = React.useRef<IDataverseService>(createService(storeRef.current));
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  const context = buildContext(storeRef.current, force);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, background: "#f3f2f1" }}>
      {readUrlAddCol() && (
        <button
          type="button"
          aria-label="DEV add column"
          style={{ position: "absolute", top: 2, left: 2, zIndex: 50 }}
          onClick={() => {
            addDevColumn();
            try {
              if (new URLSearchParams(window.location.search).get("healtest") === "1") {
                emptyUntilRefresh = true;
              }
            } catch {
              /* ignore */
            }
            force();
          }}
        >
          DEV add column
        </button>
      )}
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

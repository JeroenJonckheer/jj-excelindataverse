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
    },
    r2: {
      name: "Globex",
      email: "hello@globex.example",
      score: 40,
      status: 1,
      active: false,
      duedate: new Date(2026, 6, 1),
      owner: CONTACTS[1],
    },
    r3: {
      name: "Initech",
      email: "info@initech.example",
      score: 88,
      status: 3,
      active: true,
      duedate: new Date(2026, 4, 20),
      owner: CONTACTS[2],
    },
    r4: {
      name: "Hooli",
      email: "team@hooli.example",
      score: 15,
      status: 4,
      active: false,
      duedate: new Date(2026, 7, 9),
      owner: CONTACTS[3],
    },
    r5: {
      name: "Stark Industries",
      email: "deals@stark.example",
      score: 64,
      status: 2,
      active: true,
      duedate: new Date(2026, 8, 2),
      owner: CONTACTS[0],
    },
  };
}

const ORDER = ["r1", "r2", "r3", "r4", "r5"];

function formattedValue(value: CellValue, column: ColumnDef): string {
  if (value === null || value === undefined) return "";
  if (column.kind === "text" || column.kind === "number") return String(value);
  return formatValue(value, column);
}

function buildContext(store: Store): ComponentFramework.Context<IInputs> {
  const records: Record<string, unknown> = {};
  for (const id of ORDER) {
    records[id] = {
      getRecordId: () => id,
      getValue: (c: string) => store[id][c] ?? null,
      getFormattedValue: (c: string) =>
        formattedValue(store[id][c] ?? null, COL_BY_NAME.get(c) as ColumnDef),
    };
  }
  const dataset = {
    columns: META.map((c, i) => ({
      name: c.name,
      displayName: c.displayName,
      dataType: c.dataType,
      order: i,
      visualSizeFactor: c.name === "name" ? 1.6 : 1,
    })),
    sortedRecordIds: [...ORDER],
    records,
    getTargetEntityType: () => "demo_account",
    refresh: () => undefined,
    loading: false,
  };
  return {
    parameters: { records: dataset, pageSize: { raw: 100 } },
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
    saveRecord: (_entity, recordId, edits: PendingEdit[]) => {
      for (const edit of edits) {
        store[recordId][edit.columnName] = edit.value;
      }
      return Promise.resolve();
    },
  };
}

const Harness: React.FC = () => {
  const storeRef = React.useRef<Store>(initialStore());
  const serviceRef = React.useRef<IDataverseService>(createService(storeRef.current));
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  const context = buildContext(storeRef.current);
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

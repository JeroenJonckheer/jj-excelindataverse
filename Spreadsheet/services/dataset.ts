/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellValue, ColumnDef, LookupValue } from "./types";
import { deriveKind, deriveTextFormat, isEditableKind } from "./columns";

/**
 * Adapters between the Power Apps dataset shape and the plain data model the
 * grid renders. Kept separate from the React layer so the conversion can be
 * tested with a small mock record.
 */

/** Minimal shape of a dataset column we depend on. */
export interface DatasetColumnLike {
  name: string;
  displayName: string;
  dataType: string;
  order?: number;
  visualSizeFactor?: number;
  isHidden?: boolean;
}

/** Minimal shape of a dataset record we depend on. */
export interface DatasetRecordLike {
  getRecordId(): string;
  getValue(columnName: string): unknown;
  getFormattedValue(columnName: string): string;
}

/** Builds the column definitions (type based, before metadata enrichment). */
export function buildColumns(columns: DatasetColumnLike[]): ColumnDef[] {
  const seen = new Set<string>();
  return [...columns]
    // Only columns that are part of the view layout. Dataverse exposes extra
    // columns (such as the primary-name attribute) with order -1 even when they
    // are not on the view; those must not appear in the grid.
    .filter((c) => !c.isHidden && (c.order ?? 0) >= 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    // A view can carry the same logical column twice (for example the primary
    // name column). Keep only the first; two columns sharing a logical name
    // would otherwise share an edit and confuse the grid.
    .filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    })
    .map((c) => {
      const kind = deriveKind(c.dataType);
      return {
        name: c.name,
        displayName: c.displayName || c.name,
        dataType: c.dataType,
        kind,
        editable: isEditableKind(kind),
        required: "none",
        format: kind === "text" ? deriveTextFormat(c.dataType) : undefined,
        visualSizeFactor: c.visualSizeFactor,
      } as ColumnDef;
    });
}

/** Reads the id from the various shapes a Dataverse reference id can take. */
function readId(id: unknown): string {
  if (typeof id === "string") return id;
  if (id && typeof id === "object" && "guid" in (id as Record<string, unknown>)) {
    return String((id as { guid: unknown }).guid);
  }
  return id == null ? "" : String(id);
}

/** Extracts a typed raw value for a record cell, based on the column kind. */
export function extractRawValue(
  record: DatasetRecordLike,
  column: ColumnDef,
): CellValue {
  const raw = record.getValue(column.name);
  if (raw === null || raw === undefined || raw === "") return null;

  switch (column.kind) {
    case "number": {
      const num = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    case "boolean": {
      if (typeof raw === "string") {
        const v = raw.trim().toLowerCase();
        return v === "true" || v === "1" || v === "yes";
      }
      return raw === true || raw === 1;
    }
    case "choice": {
      const num = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    case "multichoice": {
      if (Array.isArray(raw)) return raw.map((v) => Number(v));
      if (typeof raw === "string") {
        return raw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n));
      }
      return null;
    }
    case "date":
    case "datetime": {
      if (raw instanceof Date) return raw;
      const d = new Date(raw as string | number);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case "lookup": {
      const refArray = Array.isArray(raw) ? raw[0] : raw;
      if (!refArray || typeof refArray !== "object") return null;
      const ref = refArray as Record<string, unknown>;
      const value: LookupValue = {
        id: readId(ref.id),
        name: typeof ref.name === "string" ? ref.name : "",
        entityType: typeof ref.etn === "string" ? ref.etn : String(ref.entityType ?? ""),
      };
      return value.id ? value : null;
    }
    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

/** A single row of the grid model. */
export interface GridRow {
  recordId: string;
  raw: Record<string, CellValue>;
  display: Record<string, string>;
}

/** Builds the grid rows from the dataset records and columns. */
export function buildRows(
  recordIds: string[],
  records: Record<string, DatasetRecordLike>,
  columns: ColumnDef[],
): GridRow[] {
  const rows: GridRow[] = [];
  for (const id of recordIds) {
    const record = records[id];
    if (!record) continue;
    const raw: Record<string, CellValue> = {};
    const display: Record<string, string> = {};
    for (const col of columns) {
      raw[col.name] = extractRawValue(record, col);
      display[col.name] = record.getFormattedValue(col.name) ?? "";
    }
    rows.push({ recordId: id, raw, display });
  }
  return rows;
}

/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellValue, ColumnDef, LookupValue } from "./types";

/**
 * Pure formatting and parsing helpers shared by the editors. These functions
 * convert between the raw cell value and the text shown to the user. They hold
 * no host state so that they can be unit tested deterministically.
 */

/** Type guard for a lookup value. */
export function isLookupValue(value: CellValue): value is LookupValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as LookupValue).id === "string"
  );
}

/** Returns true when a value is considered empty for validation and display. */
export function isEmpty(value: CellValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Compares two cell values for equality, handling the kinds a cell can hold
 * (lookups by id, dates by time, choice arrays by members). Used to recognise an
 * edit that returns a cell to its original value, so it is no longer marked as a
 * pending change.
 */
export function valuesEqual(a: CellValue, b: CellValue): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) !== isEmpty(b)) return false;
  if (isLookupValue(a) && isLookupValue(b)) {
    return a.id === b.id && a.entityType === b.entityType;
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** Pads a number to two digits, used when formatting dates. */
function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** Formats a date as an ISO-style yyyy-mm-dd string in local time. */
export function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Formats a date and time as yyyy-mm-dd hh:mm in local time. */
export function formatDateTime(date: Date): string {
  return `${formatDateOnly(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Produces the text shown in a cell for a given value and column. Used for
 * edited values; the unedited display normally comes from the dataset's own
 * formatted value.
 */
export function formatValue(value: CellValue, column: ColumnDef): string {
  if (isEmpty(value)) return "";

  switch (column.kind) {
    case "boolean": {
      const opt = (column.options ?? []).find(
        (o) => o.value === (value === true ? 1 : 0),
      );
      if (opt) return opt.label;
      return value ? "Yes" : "No";
    }
    case "choice": {
      const num = typeof value === "number" ? value : Number(value);
      const opt = (column.options ?? []).find((o) => o.value === num);
      return opt ? opt.label : String(value);
    }
    case "multichoice": {
      const arr = Array.isArray(value) ? value : [];
      const labels = arr.map((v) => {
        const opt = (column.options ?? []).find((o) => o.value === v);
        return opt ? opt.label : String(v);
      });
      return labels.join("; ");
    }
    case "lookup":
      return isLookupValue(value) ? value.name : "";
    case "date":
      return value instanceof Date ? formatDateOnly(value) : String(value);
    case "datetime":
      return value instanceof Date ? formatDateTime(value) : String(value);
    default:
      return String(value);
  }
}

/** Parses a yyyy-mm-dd (or any Date-parseable) string into a Date or null. */
export function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Parses a numeric string, tolerating thousands separators and spaces. */
export function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const normalized = trimmed.replace(/\s/g, "").replace(/,/g, "");
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Converts raw user input text into a typed cell value for the given column.
 * Returns null for empty input. Returns the special token "INVALID" wrapped via
 * a sentinel object is avoided; instead callers validate the parsed value.
 */
export function parseInput(raw: string, column: ColumnDef): CellValue {
  switch (column.kind) {
    case "number":
      return parseNumber(raw);
    case "date":
    case "datetime":
      return parseDate(raw);
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (v === "") return null;
      if (["yes", "true", "1", "ja"].includes(v)) return true;
      if (["no", "false", "0", "nee"].includes(v)) return false;
      return raw;
    }
    default:
      return raw;
  }
}

/** Counts the number of decimal places in a number. */
export function decimalPlaces(num: number): number {
  if (!Number.isFinite(num)) return 0;
  const str = String(num);
  const dot = str.indexOf(".");
  return dot < 0 ? 0 : str.length - dot - 1;
}

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

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The text shown for a committed date in a cell: `dd-MMM-yy` (e.g. 04-Mar-26),
 * matching how Dataverse renders date columns, so an edited cell looks the same
 * as the unedited ones around it.
 */
export function formatDisplayDate(date: Date): string {
  return `${pad2(date.getDate())}-${MONTHS_SHORT[date.getMonth()]}-${pad2(date.getFullYear() % 100)}`;
}

/** The shown text for a committed date/time: `dd-MMM-yy hh:mm`. */
export function formatDisplayDateTime(date: Date): string {
  return `${formatDisplayDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
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
      return value instanceof Date ? formatDisplayDate(value) : String(value);
    case "datetime":
      return value instanceof Date ? formatDisplayDateTime(value) : String(value);
    default:
      return String(value);
  }
}

/** Parses a yyyy-mm-dd (or any Date-parseable) string into a Date or null. */
/**
 * Builds a Date from explicit parts plus any time found in the text, and
 * rejects impossible dates (for example 31/02) instead of letting them roll
 * over into the next month.
 */
function buildDate(year: number, month: number, day: number, raw: string): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const time = /(\d{1,2}):(\d{2})/.exec(raw);
  const hh = time ? Number(time[1]) : 0;
  const mm = time ? Number(time[2]) : 0;
  const date = new Date(year, month - 1, day, hh, mm);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parses a date the way this org enters them. ISO (yyyy-MM-dd) is taken as-is.
 * A d/M/y date (with / . or - separators, optional time) is read DAY-first to
 * match the Dutch / European locale, falling back to month-first only when the
 * first number cannot be a day (so an unambiguous US-style date still parses).
 */
export function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), trimmed);
  }

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(trimmed);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const year = Number(dmy[3]);
    // Month-first only when the first value cannot be a day; otherwise day-first.
    const monthFirst = a <= 12 && b > 12;
    const day = monthFirst ? b : a;
    const month = monthFirst ? a : b;
    return buildDate(year, month, day, trimmed);
  }

  // dd-MMM-yy / dd MMM yyyy (the display format, e.g. 01-Jun-26), so a shown
  // date round-trips and the picker opens on the right month.
  const mmm = /^(\d{1,2})[ \-/.]([A-Za-z]{3,})[ \-/.](\d{2,4})/.exec(trimmed);
  if (mmm) {
    const day = Number(mmm[1]);
    const monthIdx = MONTHS_SHORT.findIndex(
      (m) => m.toLowerCase() === mmm[2].slice(0, 3).toLowerCase(),
    );
    let year = Number(mmm[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (monthIdx >= 0) return buildDate(year, monthIdx + 1, day, trimmed);
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

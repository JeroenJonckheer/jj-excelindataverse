/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellKind, ColumnDef } from "./types";

/**
 * Pure helpers for turning Dataverse column data types into editor kinds and
 * for distributing columns across the full available width.
 */

/** Data types that the control treats as read-only (no inline editor). */
const READONLY_TYPES = new Set<string>([
  "Lookup.Customer",
  "Lookup.Owner",
  "Lookup.PartyList",
  "Lookup.Regarding",
  "Multiple", // very large multiline; still editable as text but treated as text
]);

/**
 * Derives the editor kind from a PCF column data type. Unknown types fall back
 * to read-only so the control never tries to edit something it does not
 * understand.
 */
export function deriveKind(dataType: string): CellKind {
  if (dataType.startsWith("Lookup.")) {
    return READONLY_TYPES.has(dataType) ? "readonly" : "lookup";
  }
  switch (dataType) {
    case "SingleLine.Text":
    case "SingleLine.TextArea":
    case "SingleLine.Email":
    case "SingleLine.Phone":
    case "SingleLine.URL":
    case "SingleLine.Ticker":
      return "text";
    case "Multiple":
      return "multiline";
    case "Whole.None":
    case "Decimal":
    case "FP":
    case "Currency":
      return "number";
    case "DateAndTime.DateOnly":
      return "date";
    case "DateAndTime.DateAndTime":
      return "datetime";
    case "OptionSet":
    case "Status":
      return "choice";
    case "MultiSelectPicklist":
      return "multichoice";
    case "TwoOptions":
      return "boolean";
    default:
      return "readonly";
  }
}

/** Maps a single line text data type to its text format. */
export function deriveTextFormat(
  dataType: string,
): ColumnDef["format"] {
  switch (dataType) {
    case "SingleLine.Email":
      return "email";
    case "SingleLine.Phone":
      return "phone";
    case "SingleLine.URL":
      return "url";
    default:
      return "text";
  }
}

/** Whether a derived kind supports inline editing. */
export function isEditableKind(kind: CellKind): boolean {
  return kind !== "readonly";
}

/**
 * Distributes the given total width across the columns so that they always fill
 * the full width. The relative share of each column comes from its visual size
 * factor (from the view), falling back to an equal share. A sensible minimum
 * width keeps narrow columns usable.
 */
export function distributeWidths(
  columns: Pick<ColumnDef, "visualSizeFactor">[],
  totalWidth: number,
  minWidth = 80,
): number[] {
  const count = columns.length;
  if (count === 0) return [];
  if (totalWidth <= 0) return columns.map(() => minWidth);

  const factors = columns.map((c) =>
    typeof c.visualSizeFactor === "number" && c.visualSizeFactor > 0
      ? c.visualSizeFactor
      : 1,
  );
  const sum = factors.reduce((a, b) => a + b, 0);

  // Initial proportional allocation.
  let widths = factors.map((f) => (f / sum) * totalWidth);

  // Enforce the minimum width, then re-distribute the remainder proportionally
  // across the columns that are still above the minimum.
  widths = widths.map((w) => Math.max(w, minWidth));
  const over = widths.reduce((a, b) => a + b, 0) - totalWidth;
  if (over > 0) {
    const flexible = widths
      .map((w, i) => ({ i, w }))
      .filter((x) => x.w > minWidth);
    const flexSum = flexible.reduce((a, b) => a + b.w, 0);
    if (flexSum > 0) {
      for (const x of flexible) {
        widths[x.i] -= over * (x.w / flexSum);
        if (widths[x.i] < minWidth) widths[x.i] = minWidth;
      }
    }
  }

  return widths.map((w) => Math.round(w));
}

/**
 * Computes each column's share of the full width as a percentage, proportional
 * to its visual size factor with a sensible floor so no column collapses. The
 * result always sums to 100, which is how the grid fills the full width without
 * needing to measure pixels.
 */
export function computePercentWidths(
  columns: Pick<ColumnDef, "visualSizeFactor">[],
  minPercent = 6,
): number[] {
  const count = columns.length;
  if (count === 0) return [];

  const factors = columns.map((c) =>
    typeof c.visualSizeFactor === "number" && c.visualSizeFactor > 0
      ? c.visualSizeFactor
      : 1,
  );
  const sum = factors.reduce((a, b) => a + b, 0);
  const floor = Math.min(minPercent, 100 / count);

  let widths = factors.map((f) => Math.max((f / sum) * 100, floor));
  const total = widths.reduce((a, b) => a + b, 0);
  // Normalise back to exactly 100 after applying the floor.
  widths = widths.map((w) => (w / total) * 100);
  return widths;
}

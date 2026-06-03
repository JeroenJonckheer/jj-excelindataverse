/*
 * JJ - Excel in Dataverse
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

/** The width (px) a column gets when the view defines no size for it. */
export const DEFAULT_COLUMN_WIDTH = 150;
/** A column never renders narrower than this (px), so it stays usable. */
export const MIN_COLUMN_WIDTH = 48;

/**
 * Computes each column's width in pixels, the way the standard Dynamics grid
 * does it. Each column starts at the pixel width configured in the view
 * (`visualSizeFactor` is that width in pixels), or a manual resize override.
 *
 * - If those widths fill or overflow the available space, they are kept as-is
 *   and the grid scrolls horizontally - so a 100px column stays 100px.
 * - If there is room to spare, the columns are stretched proportionally to fill
 *   the width, preserving their relative sizes (the narrowest stays narrowest).
 *
 * Manually resized columns are treated as fixed: they keep their width and only
 * the remaining columns share the leftover space.
 */
export function computeColumnWidths(
  columns: Pick<ColumnDef, "name" | "visualSizeFactor">[],
  availableWidth: number,
  overrides: Record<string, number> = {},
  opts: { defaultWidth?: number; minWidth?: number } = {},
): number[] {
  const n = columns.length;
  if (n === 0) return [];
  const defaultWidth = opts.defaultWidth ?? DEFAULT_COLUMN_WIDTH;
  const minWidth = opts.minWidth ?? MIN_COLUMN_WIDTH;

  const isFixed = columns.map(
    (c) => typeof overrides[c.name] === "number" && overrides[c.name] > 0,
  );
  const base = columns.map((c, i) => {
    if (isFixed[i]) return Math.max(overrides[c.name], minWidth);
    const f = c.visualSizeFactor;
    return Math.max(typeof f === "number" && f > 0 ? f : defaultWidth, minWidth);
  });

  const fixedTotal = base.reduce((a, w, i) => a + (isFixed[i] ? w : 0), 0);
  const flexBase = base.reduce((a, w, i) => a + (isFixed[i] ? 0 : w), 0);
  const availForFlex = availableWidth - fixedTotal;

  // Not measured yet, no flexible columns, or the columns already fill/overflow
  // the space: keep the configured pixel widths and let the grid scroll.
  if (availableWidth <= 0 || flexBase <= 0 || availForFlex <= flexBase) {
    return base.map((w) => Math.round(w));
  }

  // Room to spare: stretch the flexible columns proportionally to fill it.
  const scale = availForFlex / flexBase;
  return base.map((w, i) => Math.round(isFixed[i] ? w : w * scale));
}

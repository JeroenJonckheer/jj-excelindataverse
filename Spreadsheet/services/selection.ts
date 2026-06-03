/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellAddress } from "./types";

/**
 * Pure helpers for the rectangular cell selection - the range between an anchor
 * cell and the active (focus) cell - and for the numeric aggregates the status
 * bar shows for that range.
 */

export interface RangeBounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** The normalised rectangle spanned by two cell addresses. */
export function rangeBounds(a: CellAddress, b: CellAddress): RangeBounds {
  return {
    top: Math.min(a.rowIndex, b.rowIndex),
    bottom: Math.max(a.rowIndex, b.rowIndex),
    left: Math.min(a.colIndex, b.colIndex),
    right: Math.max(a.colIndex, b.colIndex),
  };
}

/** Whether a cell falls inside the rectangle spanned by two addresses. */
export function rangeIncludes(
  a: CellAddress,
  b: CellAddress,
  addr: CellAddress,
): boolean {
  const r = rangeBounds(a, b);
  return (
    addr.rowIndex >= r.top &&
    addr.rowIndex <= r.bottom &&
    addr.colIndex >= r.left &&
    addr.colIndex <= r.right
  );
}

/** The number of cells in the rectangle spanned by two addresses. */
export function rangeSize(a: CellAddress, b: CellAddress): number {
  const r = rangeBounds(a, b);
  return (r.bottom - r.top + 1) * (r.right - r.left + 1);
}

export interface Aggregates {
  numericCount: number;
  sum: number;
  average: number | null;
  min: number | null;
  max: number | null;
}

/**
 * Aggregates the numeric values in a selection, the way Excel's status bar does.
 * Non-finite values are ignored; with no numbers the aggregates are empty.
 */
export function aggregate(values: number[]): Aggregates {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) {
    return { numericCount: 0, sum: 0, average: null, min: null, max: null };
  }
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    numericCount: nums.length,
    sum,
    average: sum / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

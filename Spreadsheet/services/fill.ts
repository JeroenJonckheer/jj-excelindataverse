/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/**
 * Pure logic for the fill handle (drag the corner of a selection to fill the
 * column down or up, the way Excel does). The grid fills one column at a time;
 * this module decides, per target cell, whether it gets a computed number (a
 * numeric series) or a copy of one of the source cells (cyclic repeat).
 */

export type FillDirection = "forward" | "backward";

/**
 * Continues a numeric sequence. A single value repeats (a plain copy, like
 * Excel); two or more extrapolate by the average step. "forward" extends after
 * the last value (filling down), "backward" before the first (filling up), each
 * ordered nearest-to-source first.
 */
export function numericSeries(
  source: number[],
  count: number,
  direction: FillDirection,
): number[] {
  if (count <= 0) return [];
  if (source.length === 0) return new Array(count).fill(0);
  if (source.length === 1) return new Array(count).fill(source[0]);

  let step = 0;
  for (let i = 1; i < source.length; i++) step += source[i] - source[i - 1];
  step /= source.length - 1;

  const out: number[] = [];
  if (direction === "forward") {
    let last = source[source.length - 1];
    for (let i = 0; i < count; i++) {
      last += step;
      out.push(last);
    }
  } else {
    let first = source[0];
    for (let i = 0; i < count; i++) {
      first -= step;
      out.push(first);
    }
  }
  return out;
}

export interface FillPlanItem {
  /** The computed number for a numeric series cell, or null for a copy cell. */
  value: number | null;
  /** For a copy cell, the source index to copy; -1 for a numeric series cell. */
  sourceIndex: number;
}

/**
 * Plans the fill for one column: `count` target cells continuing from the given
 * source cells. A number column whose source cells are all numeric extrapolates
 * a series; anything else repeats the source values cyclically.
 */
export function planColumnFill(
  sourceNumbers: (number | null)[],
  count: number,
  direction: FillDirection,
  isNumberColumn: boolean,
): FillPlanItem[] {
  const n = sourceNumbers.length;
  const out: FillPlanItem[] = [];
  if (n === 0 || count <= 0) return out;

  const allNumeric = sourceNumbers.every(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
  if (isNumberColumn && allNumeric) {
    const series = numericSeries(sourceNumbers as number[], count, direction);
    for (let i = 0; i < count; i++) {
      out.push({ value: series[i], sourceIndex: -1 });
    }
    return out;
  }

  for (let i = 0; i < count; i++) {
    const idx = direction === "forward" ? i % n : (n - 1 - (i % n) + n) % n;
    out.push({ value: null, sourceIndex: idx });
  }
  return out;
}

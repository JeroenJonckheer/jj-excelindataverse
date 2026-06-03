/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { numericSeries, planColumnFill } from "../Spreadsheet/services/fill";

describe("numericSeries", () => {
  it("copies a single value", () => {
    expect(numericSeries([5], 3, "forward")).toEqual([5, 5, 5]);
  });
  it("extrapolates an arithmetic series forward", () => {
    expect(numericSeries([1, 2], 3, "forward")).toEqual([3, 4, 5]);
    expect(numericSeries([10, 20], 2, "forward")).toEqual([30, 40]);
  });
  it("extrapolates backward, nearest-to-source first", () => {
    expect(numericSeries([3, 4], 2, "backward")).toEqual([2, 1]);
  });
  it("uses the average step", () => {
    expect(numericSeries([0, 2, 4], 2, "forward")).toEqual([6, 8]);
  });
});

describe("planColumnFill", () => {
  it("plans a numeric series for a number column", () => {
    const plan = planColumnFill([1, 2], 3, "forward", true);
    expect(plan).toEqual([
      { value: 3, sourceIndex: -1 },
      { value: 4, sourceIndex: -1 },
      { value: 5, sourceIndex: -1 },
    ]);
  });
  it("copies (repeats) for a non-number column", () => {
    const plan = planColumnFill([null, null], 3, "forward", false);
    expect(plan.map((p) => p.sourceIndex)).toEqual([0, 1, 0]);
    expect(plan.every((p) => p.value === null)).toBe(true);
  });
  it("repeats backward nearest-to-source first", () => {
    const plan = planColumnFill([null, null], 3, "backward", false);
    expect(plan.map((p) => p.sourceIndex)).toEqual([1, 0, 1]);
  });
  it("falls back to copy when a number column has a non-numeric source cell", () => {
    const plan = planColumnFill([1, null], 2, "forward", true);
    expect(plan.map((p) => p.sourceIndex)).toEqual([0, 1]);
  });
});

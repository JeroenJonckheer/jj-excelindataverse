/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  aggregate,
  rangeBounds,
  rangeIncludes,
  rangeSize,
} from "../Spreadsheet/services/selection";

describe("rangeBounds", () => {
  it("normalises any two corners into top/left/bottom/right", () => {
    expect(
      rangeBounds({ rowIndex: 3, colIndex: 5 }, { rowIndex: 1, colIndex: 2 }),
    ).toEqual({ top: 1, left: 2, bottom: 3, right: 5 });
  });
});

describe("rangeIncludes", () => {
  const a = { rowIndex: 1, colIndex: 1 };
  const b = { rowIndex: 3, colIndex: 3 };
  it("includes cells inside the rectangle", () => {
    expect(rangeIncludes(a, b, { rowIndex: 2, colIndex: 2 })).toBe(true);
    expect(rangeIncludes(a, b, { rowIndex: 1, colIndex: 3 })).toBe(true);
  });
  it("excludes cells outside the rectangle", () => {
    expect(rangeIncludes(a, b, { rowIndex: 0, colIndex: 2 })).toBe(false);
    expect(rangeIncludes(a, b, { rowIndex: 2, colIndex: 4 })).toBe(false);
  });
});

describe("rangeSize", () => {
  it("counts the cells in the rectangle", () => {
    expect(rangeSize({ rowIndex: 0, colIndex: 0 }, { rowIndex: 0, colIndex: 0 })).toBe(1);
    expect(rangeSize({ rowIndex: 0, colIndex: 0 }, { rowIndex: 2, colIndex: 1 })).toBe(6);
  });
});

describe("aggregate", () => {
  it("is empty when there are no numbers", () => {
    expect(aggregate([])).toEqual({
      numericCount: 0,
      sum: 0,
      average: null,
      min: null,
      max: null,
    });
  });
  it("sums, averages and finds the extremes", () => {
    expect(aggregate([2, 4, 6])).toEqual({
      numericCount: 3,
      sum: 12,
      average: 4,
      min: 2,
      max: 6,
    });
  });
  it("ignores non-finite values", () => {
    expect(aggregate([1, NaN, Infinity, 3])).toMatchObject({
      numericCount: 2,
      sum: 4,
    });
  });
});

/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  buildDatasetFilter,
  conditionsFor,
  isActiveFilter,
  COND_EQUAL,
  COND_GREATER_EQUAL,
  COND_IN,
  COND_LESS_EQUAL,
  COND_LIKE,
} from "../Spreadsheet/services/filter";

describe("isActiveFilter", () => {
  it("recognises empty filters", () => {
    expect(isActiveFilter({ columnName: "a", kind: "text", contains: "  " })).toBe(false);
    expect(isActiveFilter({ columnName: "a", kind: "number", min: null, max: null })).toBe(false);
    expect(isActiveFilter({ columnName: "a", kind: "choice", values: [] })).toBe(false);
  });
  it("recognises active filters", () => {
    expect(isActiveFilter({ columnName: "a", kind: "text", contains: "x" })).toBe(true);
    expect(isActiveFilter({ columnName: "a", kind: "number", min: 1, max: null })).toBe(true);
  });
});

describe("conditionsFor", () => {
  it("builds a Like condition for text", () => {
    expect(conditionsFor({ columnName: "name", kind: "text", contains: "acme" })).toEqual([
      { attributeName: "name", conditionOperator: COND_LIKE, value: "%acme%" },
    ]);
  });
  it("builds range conditions for numbers", () => {
    expect(conditionsFor({ columnName: "score", kind: "number", min: 10, max: 80 })).toEqual([
      { attributeName: "score", conditionOperator: COND_GREATER_EQUAL, value: 10 },
      { attributeName: "score", conditionOperator: COND_LESS_EQUAL, value: 80 },
    ]);
  });
  it("uses Equal for one choice and In for several", () => {
    expect(conditionsFor({ columnName: "s", kind: "choice", values: [2] })).toEqual([
      { attributeName: "s", conditionOperator: COND_EQUAL, value: 2 },
    ]);
    expect(conditionsFor({ columnName: "s", kind: "choice", values: [1, 3] })).toEqual([
      { attributeName: "s", conditionOperator: COND_IN, value: [1, 3] },
    ]);
  });
});

describe("buildDatasetFilter", () => {
  it("returns null when nothing is filtered", () => {
    expect(buildDatasetFilter([])).toBeNull();
    expect(
      buildDatasetFilter([{ columnName: "a", kind: "text", contains: "" }]),
    ).toBeNull();
  });
  it("ANDs the conditions of all columns", () => {
    const filter = buildDatasetFilter([
      { columnName: "name", kind: "text", contains: "acme" },
      { columnName: "score", kind: "number", min: 10, max: null },
    ]);
    expect(filter).toEqual({
      filterOperator: 0,
      conditions: [
        { attributeName: "name", conditionOperator: COND_LIKE, value: "%acme%" },
        { attributeName: "score", conditionOperator: COND_GREATER_EQUAL, value: 10 },
      ],
    });
  });
});

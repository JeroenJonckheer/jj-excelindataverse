/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  computePercentWidths,
  deriveKind,
  deriveTextFormat,
  distributeWidths,
  isEditableKind,
} from "../Spreadsheet/services/columns";

describe("deriveKind", () => {
  it("maps the common Dataverse data types", () => {
    expect(deriveKind("SingleLine.Text")).toBe("text");
    expect(deriveKind("SingleLine.Email")).toBe("text");
    expect(deriveKind("Multiple")).toBe("multiline");
    expect(deriveKind("Whole.None")).toBe("number");
    expect(deriveKind("Decimal")).toBe("number");
    expect(deriveKind("Currency")).toBe("number");
    expect(deriveKind("DateAndTime.DateOnly")).toBe("date");
    expect(deriveKind("DateAndTime.DateAndTime")).toBe("datetime");
    expect(deriveKind("OptionSet")).toBe("choice");
    expect(deriveKind("MultiSelectPicklist")).toBe("multichoice");
    expect(deriveKind("TwoOptions")).toBe("boolean");
    expect(deriveKind("Lookup.Simple")).toBe("lookup");
  });
  it("treats unsupported and special lookup types as read-only", () => {
    expect(deriveKind("Lookup.Customer")).toBe("readonly");
    expect(deriveKind("Lookup.Owner")).toBe("readonly");
    expect(deriveKind("Unknown.Type")).toBe("readonly");
  });
});

describe("deriveTextFormat", () => {
  it("maps the special text formats", () => {
    expect(deriveTextFormat("SingleLine.Email")).toBe("email");
    expect(deriveTextFormat("SingleLine.Phone")).toBe("phone");
    expect(deriveTextFormat("SingleLine.URL")).toBe("url");
    expect(deriveTextFormat("SingleLine.Text")).toBe("text");
  });
});

describe("isEditableKind", () => {
  it("returns false only for read-only", () => {
    expect(isEditableKind("text")).toBe(true);
    expect(isEditableKind("lookup")).toBe(true);
    expect(isEditableKind("readonly")).toBe(false);
  });
});

describe("distributeWidths", () => {
  it("returns empty for no columns", () => {
    expect(distributeWidths([], 1000)).toEqual([]);
  });
  it("fills the full width", () => {
    const widths = distributeWidths([{}, {}, {}], 900);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(900, 0);
  });
  it("respects the relative size factors", () => {
    const widths = distributeWidths(
      [{ visualSizeFactor: 1 }, { visualSizeFactor: 3 }],
      800,
    );
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });
  it("applies a minimum width", () => {
    const widths = distributeWidths([{ visualSizeFactor: 1 }, { visualSizeFactor: 100 }], 200, 80);
    expect(widths[0]).toBeGreaterThanOrEqual(80);
  });
});

describe("computePercentWidths", () => {
  it("sums to 100", () => {
    const widths = computePercentWidths([{}, {}, {}]);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });
  it("gives wider factors more space", () => {
    const widths = computePercentWidths([{ visualSizeFactor: 1 }, { visualSizeFactor: 4 }]);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });
  it("returns empty for no columns", () => {
    expect(computePercentWidths([])).toEqual([]);
  });
});

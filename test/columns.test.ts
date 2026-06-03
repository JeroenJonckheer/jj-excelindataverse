/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  computeColumnWidths,
  deriveKind,
  deriveTextFormat,
  distributeWidths,
  fitColumnWidth,
  isEditableKind,
  moveColumn,
  orderColumns,
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

describe("computeColumnWidths", () => {
  const cols = (...px: number[]) =>
    px.map((w, i) => ({ name: `c${i}`, visualSizeFactor: w }));

  it("returns empty for no columns", () => {
    expect(computeColumnWidths([], 1000)).toEqual([]);
  });

  it("keeps the configured pixel widths when they overflow the space", () => {
    const widths = computeColumnWidths(cols(300, 300, 300), 500);
    expect(widths).toEqual([300, 300, 300]);
  });

  it("keeps the configured pixel widths when they exactly fill the space", () => {
    const widths = computeColumnWidths(cols(100, 200), 300);
    expect(widths).toEqual([100, 200]);
  });

  it("stretches proportionally to fill when there is room", () => {
    const widths = computeColumnWidths(cols(100, 300), 800);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(800);
    // The 100px column stays the narrowest, in the same 1:3 proportion.
    expect(widths[1] / widths[0]).toBeCloseTo(3, 1);
    expect(widths[0]).toBeLessThan(widths[1]);
  });

  it("falls back to a default width when the view defines none", () => {
    const widths = computeColumnWidths(
      [{ name: "a" }, { name: "b" }],
      0,
      {},
      { defaultWidth: 150 },
    );
    expect(widths).toEqual([150, 150]);
  });

  it("applies the minimum width", () => {
    const widths = computeColumnWidths(cols(10), 0, {}, { minWidth: 48 });
    expect(widths[0]).toBe(48);
  });

  it("treats a manual override as a fixed width that is not rescaled", () => {
    const widths = computeColumnWidths(cols(100, 100), 800, { c0: 120 });
    // The overridden column keeps 120; only the flexible one absorbs the rest.
    expect(widths[0]).toBe(120);
    expect(widths[0] + widths[1]).toBe(800);
    expect(widths[1]).toBe(680);
  });
});

describe("orderColumns", () => {
  const cols = (...names: string[]) => names.map((name) => ({ name }));
  it("returns columns unchanged with no order", () => {
    expect(orderColumns(cols("a", "b", "c"), null).map((c) => c.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("reorders by the saved name order", () => {
    expect(
      orderColumns(cols("a", "b", "c"), ["c", "a", "b"]).map((c) => c.name),
    ).toEqual(["c", "a", "b"]);
  });
  it("drops unknown names and appends columns missing from the order", () => {
    expect(
      orderColumns(cols("a", "b", "c"), ["c", "x"]).map((c) => c.name),
    ).toEqual(["c", "a", "b"]);
  });
});

describe("moveColumn", () => {
  it("moves a column to sit before the target", () => {
    expect(moveColumn(["a", "b", "c", "d"], "d", "b")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });
  it("is a no-op for the same column or an unknown target", () => {
    expect(moveColumn(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveColumn(["a", "b"], "a", "z")).toEqual(["a", "b"]);
  });
});

describe("fitColumnWidth", () => {
  it("fits the widest content plus padding", () => {
    expect(fitColumnWidth([40, 120, 80], { padding: 10, min: 48, max: 600 })).toBe(130);
  });
  it("clamps to the minimum and maximum", () => {
    expect(fitColumnWidth([10], { min: 48, padding: 0 })).toBe(48);
    expect(fitColumnWidth([5000], { max: 600 })).toBe(600);
  });
});

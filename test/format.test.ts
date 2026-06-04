/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  decimalPlaces,
  formatDateOnly,
  formatDateTime,
  formatValue,
  isEmpty,
  isLookupValue,
  parseDate,
  parseInput,
  parseNumber,
  valuesEqual,
} from "../Spreadsheet/services/format";
import type { ColumnDef } from "../Spreadsheet/services/types";

function col(partial: Partial<ColumnDef>): ColumnDef {
  return {
    name: "c",
    displayName: "C",
    dataType: "SingleLine.Text",
    kind: "text",
    editable: true,
    required: "none",
    ...partial,
  };
}

describe("valuesEqual", () => {
  it("treats different kinds of empty as equal", () => {
    expect(valuesEqual(null, "")).toBe(true);
    expect(valuesEqual("   ", null)).toBe(true);
  });
  it("compares primitives", () => {
    expect(valuesEqual(5, 5)).toBe(true);
    expect(valuesEqual(5, 6)).toBe(false);
    expect(valuesEqual("Acme", "Acme")).toBe(true);
    expect(valuesEqual("Acme", "Other")).toBe(false);
  });
  it("compares lookups by id and table", () => {
    const a = { id: "1", name: "Jane", entityType: "contact" };
    expect(valuesEqual(a, { id: "1", name: "Jane Doe", entityType: "contact" })).toBe(true);
    expect(valuesEqual(a, { id: "2", name: "Jane", entityType: "contact" })).toBe(false);
  });
  it("compares dates by time and empty vs filled", () => {
    expect(valuesEqual(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(true);
    expect(valuesEqual(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe(false);
    expect(valuesEqual(null, 5)).toBe(false);
  });
});

describe("isEmpty", () => {
  it("treats null, undefined, blank strings and empty arrays as empty", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty("")).toBe(true);
    expect(isEmpty("   ")).toBe(true);
    expect(isEmpty([])).toBe(true);
  });
  it("treats real values as not empty", () => {
    expect(isEmpty("x")).toBe(false);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty([1])).toBe(false);
  });
});

describe("isLookupValue", () => {
  it("recognises a lookup object", () => {
    expect(isLookupValue({ id: "1", name: "A", entityType: "account" })).toBe(true);
  });
  it("rejects non-lookups", () => {
    expect(isLookupValue("x")).toBe(false);
    expect(isLookupValue(5)).toBe(false);
    expect(isLookupValue([1, 2])).toBe(false);
    expect(isLookupValue(null)).toBe(false);
  });
});

describe("date formatting", () => {
  it("formats date only", () => {
    expect(formatDateOnly(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("formats date and time", () => {
    expect(formatDateTime(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05 09:07");
  });
});

describe("parseNumber", () => {
  it("parses plain and signed numbers", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("-3.5")).toBe(-3.5);
    expect(parseNumber("  1000 ")).toBe(1000);
    expect(parseNumber("1,234.5")).toBe(1234.5);
  });
  it("returns null for non-numbers and blanks", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1.2.3")).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses ISO style dates", () => {
    const d = parseDate("2026-03-01");
    expect(d).not.toBeNull();
    expect((d as Date).getFullYear()).toBe(2026);
    expect((d as Date).getMonth()).toBe(2);
  });
  it("returns null for blank and invalid", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("not-a-date")).toBeNull();
  });
  it("parses day-first European dates, including day > 12", () => {
    const d = parseDate("23/01/2026") as Date;
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0); // January
    expect(d.getDate()).toBe(23);
  });
  it("treats an ambiguous d/M date as day-first", () => {
    const d = parseDate("11/01/2026") as Date;
    expect(d.getMonth()).toBe(0); // January, not November
    expect(d.getDate()).toBe(11);
  });
  it("falls back to month-first only when the first value cannot be a day", () => {
    const d = parseDate("01/23/2026") as Date;
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(23);
  });
  it("accepts dashes and a trailing time", () => {
    const d = parseDate("03-06-2026 11:12") as Date;
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(11);
  });
  it("rejects impossible dates instead of rolling over", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("13/13/2026")).toBeNull();
  });
});

describe("parseInput", () => {
  it("parses by column kind", () => {
    expect(parseInput("5", col({ kind: "number" }))).toBe(5);
    expect(parseInput("yes", col({ kind: "boolean" }))).toBe(true);
    expect(parseInput("nee", col({ kind: "boolean" }))).toBe(false);
    expect(parseInput("hello", col({ kind: "text" }))).toBe("hello");
    expect(parseInput("", col({ kind: "boolean" }))).toBeNull();
  });
});

describe("formatValue", () => {
  it("formats choice via options", () => {
    const c = col({
      kind: "choice",
      options: [
        { value: 1, label: "Open" },
        { value: 2, label: "Closed" },
      ],
    });
    expect(formatValue(2, c)).toBe("Closed");
    expect(formatValue(99, c)).toBe("99");
  });
  it("formats boolean via options", () => {
    const c = col({
      kind: "boolean",
      options: [
        { value: 0, label: "No" },
        { value: 1, label: "Yes" },
      ],
    });
    expect(formatValue(true, c)).toBe("Yes");
    expect(formatValue(false, c)).toBe("No");
  });
  it("formats lookup and dates", () => {
    expect(
      formatValue({ id: "1", name: "Acme", entityType: "account" }, col({ kind: "lookup" })),
    ).toBe("Acme");
    expect(formatValue(new Date(2026, 0, 2), col({ kind: "date" }))).toBe("2026-01-02");
  });
  it("returns empty string for empty values", () => {
    expect(formatValue(null, col({}))).toBe("");
  });
  it("joins multi-choice labels", () => {
    const c = col({
      kind: "multichoice",
      options: [
        { value: 1, label: "A" },
        { value: 2, label: "B" },
      ],
    });
    expect(formatValue([1, 2], c)).toBe("A; B");
  });
});

describe("decimalPlaces", () => {
  it("counts decimals", () => {
    expect(decimalPlaces(5)).toBe(0);
    expect(decimalPlaces(5.25)).toBe(2);
    expect(decimalPlaces(0.1)).toBe(1);
  });
});

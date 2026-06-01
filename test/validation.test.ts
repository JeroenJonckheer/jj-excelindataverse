/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { validateValue } from "../Spreadsheet/services/validation";
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

describe("required level", () => {
  it("blocks an empty required field", () => {
    expect(validateValue("", col({ required: "required" }))).toBe(
      "This field is required.",
    );
    expect(validateValue(null, col({ required: "required" }))).toBe(
      "This field is required.",
    );
  });
  it("allows an empty recommended or optional field", () => {
    expect(validateValue("", col({ required: "recommended" }))).toBeNull();
    expect(validateValue(null, col({ required: "none" }))).toBeNull();
  });
});

describe("text rules", () => {
  it("enforces max length", () => {
    expect(validateValue("abcd", col({ maxLength: 3 }))).toBe(
      "Maximum length is 3 characters.",
    );
    expect(validateValue("abc", col({ maxLength: 3 }))).toBeNull();
  });
  it("validates email, url and phone formats", () => {
    expect(validateValue("not-email", col({ format: "email" }))).toBe(
      "Enter a valid email address.",
    );
    expect(validateValue("a@b.com", col({ format: "email" }))).toBeNull();
    expect(validateValue("http://x.com", col({ format: "url" }))).toBeNull();
    expect(validateValue("xyz", col({ format: "url" }))).toBe("Enter a valid URL.");
    expect(validateValue("+32 9 123 45 67", col({ format: "phone" }))).toBeNull();
    expect(validateValue("ab", col({ format: "phone" }))).toBe(
      "Enter a valid phone number.",
    );
  });
});

describe("number rules", () => {
  const base = col({ kind: "number", dataType: "Decimal" });
  it("rejects non-numbers", () => {
    expect(validateValue("x" as unknown as number, base)).toBe("Enter a valid number.");
  });
  it("enforces min and max", () => {
    expect(validateValue(-1, col({ ...base, minValue: 0 }))).toBe(
      "Value must be at least 0.",
    );
    expect(validateValue(11, col({ ...base, maxValue: 10 }))).toBe(
      "Value must be at most 10.",
    );
    expect(validateValue(5, col({ ...base, minValue: 0, maxValue: 10 }))).toBeNull();
  });
  it("enforces precision", () => {
    expect(validateValue(5.123, col({ ...base, precision: 2 }))).toBe(
      "Use at most 2 decimal places.",
    );
    expect(validateValue(5.1, col({ ...base, precision: 0 }))).toBe(
      "Enter a whole number.",
    );
    expect(validateValue(5, col({ ...base, precision: 0 }))).toBeNull();
  });
});

describe("choice rules", () => {
  const c = col({
    kind: "choice",
    options: [
      { value: 1, label: "Open" },
      { value: 2, label: "Closed" },
    ],
  });
  it("accepts valid options and rejects others", () => {
    expect(validateValue(1, c)).toBeNull();
    expect(validateValue(99, c)).toBe("Select a value from the list.");
  });
});

describe("multichoice rules", () => {
  const c = col({
    kind: "multichoice",
    options: [
      { value: 1, label: "A" },
      { value: 2, label: "B" },
    ],
  });
  it("accepts subsets and rejects unknown values", () => {
    expect(validateValue([1, 2], c)).toBeNull();
    expect(validateValue([1, 9], c)).toBe("Select values from the list.");
  });
});

describe("lookup rules", () => {
  const c = col({ kind: "lookup" });
  it("requires a real reference", () => {
    expect(validateValue("text" as unknown as never, c)).toBe(
      "Select an existing record.",
    );
    expect(
      validateValue({ id: "1", name: "A", entityType: "account" }, c),
    ).toBeNull();
    expect(validateValue({ id: "", name: "", entityType: "" }, c)).toBe(
      "Select an existing record.",
    );
  });
});

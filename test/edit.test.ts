/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { resolveText, resolveValue } from "../Spreadsheet/services/edit";
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

describe("resolveText", () => {
  it("resolves valid text", () => {
    const r = resolveText("hello", col({}));
    expect(r.value).toBe("hello");
    expect(r.display).toBe("hello");
    expect(r.error).toBeNull();
  });

  it("flags an invalid number but keeps the typed text visible", () => {
    const r = resolveText("abc", col({ kind: "number", dataType: "Decimal" }));
    expect(r.value).toBeNull();
    expect(r.display).toBe("abc");
    expect(r.error).toBe("Enter a valid number.");
  });

  it("resolves a number and its display", () => {
    const r = resolveText("12.5", col({ kind: "number", dataType: "Decimal" }));
    expect(r.value).toBe(12.5);
    expect(r.display).toBe("12.5");
    expect(r.error).toBeNull();
  });

  it("matches a choice option by label", () => {
    const c = col({
      kind: "choice",
      options: [
        { value: 1, label: "Open" },
        { value: 2, label: "Closed" },
      ],
    });
    const r = resolveText("closed", c);
    expect(r.value).toBe(2);
    expect(r.display).toBe("Closed");
    expect(r.error).toBeNull();
  });

  it("flags an unknown choice label", () => {
    const c = col({
      kind: "choice",
      options: [{ value: 1, label: "Open" }],
    });
    const r = resolveText("Nope", c);
    expect(r.error).toBe("Select a value from the list.");
  });

  it("matches a choice option by numeric value", () => {
    const c = col({
      kind: "choice",
      options: [{ value: 7, label: "Seven" }],
    });
    expect(resolveText("7", c).value).toBe(7);
  });

  it("matches boolean labels and tokens", () => {
    const c = col({
      kind: "boolean",
      options: [
        { value: 0, label: "Inactive" },
        { value: 1, label: "Active" },
      ],
    });
    expect(resolveText("active", c).value).toBe(true);
    expect(resolveText("inactive", c).value).toBe(false);
    expect(resolveText("yes", c).value).toBe(true);
    expect(resolveText("", c).value).toBeNull();
  });

  it("clears a value with empty text", () => {
    const r = resolveText("", col({}));
    expect(r.value).toBeNull();
    expect(r.display).toBe("");
  });
});

describe("resolveValue", () => {
  it("resolves a choice value", () => {
    const c = col({
      kind: "choice",
      options: [{ value: 1, label: "Open" }],
    });
    const r = resolveValue(1, c);
    expect(r.display).toBe("Open");
    expect(r.error).toBeNull();
  });

  it("flags a required empty value", () => {
    const r = resolveValue(null, col({ required: "required" }));
    expect(r.error).toBe("This field is required.");
  });
});

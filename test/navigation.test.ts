/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { nextCell, toNavKey } from "../Spreadsheet/services/navigation";

const dims = { rowCount: 3, colCount: 3 };

describe("nextCell arrows", () => {
  it("moves in each direction and clamps at the edges", () => {
    expect(nextCell({ rowIndex: 1, colIndex: 1 }, "ArrowUp", dims)).toEqual({
      rowIndex: 0,
      colIndex: 1,
    });
    expect(nextCell({ rowIndex: 1, colIndex: 1 }, "ArrowDown", dims)).toEqual({
      rowIndex: 2,
      colIndex: 1,
    });
    expect(nextCell({ rowIndex: 1, colIndex: 1 }, "ArrowLeft", dims)).toEqual({
      rowIndex: 1,
      colIndex: 0,
    });
    expect(nextCell({ rowIndex: 1, colIndex: 1 }, "ArrowRight", dims)).toEqual({
      rowIndex: 1,
      colIndex: 2,
    });
    // Clamp at top-left.
    expect(nextCell({ rowIndex: 0, colIndex: 0 }, "ArrowUp", dims)).toEqual({
      rowIndex: 0,
      colIndex: 0,
    });
    expect(nextCell({ rowIndex: 0, colIndex: 0 }, "ArrowLeft", dims)).toEqual({
      rowIndex: 0,
      colIndex: 0,
    });
  });
});

describe("nextCell Enter", () => {
  it("moves down and up, clamped", () => {
    expect(nextCell({ rowIndex: 0, colIndex: 1 }, "Enter", dims)).toEqual({
      rowIndex: 1,
      colIndex: 1,
    });
    expect(nextCell({ rowIndex: 0, colIndex: 1 }, "ShiftEnter", dims)).toEqual({
      rowIndex: 0,
      colIndex: 1,
    });
  });
});

describe("nextCell Tab", () => {
  it("moves to the next cell and wraps to the next row", () => {
    expect(nextCell({ rowIndex: 0, colIndex: 1 }, "Tab", dims)).toEqual({
      rowIndex: 0,
      colIndex: 2,
    });
    // End of a row wraps to the start of the next row.
    expect(nextCell({ rowIndex: 0, colIndex: 2 }, "Tab", dims)).toEqual({
      rowIndex: 1,
      colIndex: 0,
    });
    // Last cell stays put.
    expect(nextCell({ rowIndex: 2, colIndex: 2 }, "Tab", dims)).toEqual({
      rowIndex: 2,
      colIndex: 2,
    });
  });
  it("Shift+Tab moves back and wraps to the previous row", () => {
    expect(nextCell({ rowIndex: 1, colIndex: 0 }, "ShiftTab", dims)).toEqual({
      rowIndex: 0,
      colIndex: 2,
    });
    expect(nextCell({ rowIndex: 0, colIndex: 0 }, "ShiftTab", dims)).toEqual({
      rowIndex: 0,
      colIndex: 0,
    });
  });
});

describe("nextCell guards", () => {
  it("returns the current cell when the grid is empty", () => {
    const empty = { rowCount: 0, colCount: 0 };
    expect(nextCell({ rowIndex: 0, colIndex: 0 }, "ArrowDown", empty)).toEqual({
      rowIndex: 0,
      colIndex: 0,
    });
  });
});

describe("toNavKey", () => {
  it("maps keys with the shift modifier", () => {
    expect(toNavKey("ArrowUp", false)).toBe("ArrowUp");
    expect(toNavKey("Tab", false)).toBe("Tab");
    expect(toNavKey("Tab", true)).toBe("ShiftTab");
    expect(toNavKey("Enter", false)).toBe("Enter");
    expect(toNavKey("Enter", true)).toBe("ShiftEnter");
    expect(toNavKey("a", false)).toBeNull();
  });
});

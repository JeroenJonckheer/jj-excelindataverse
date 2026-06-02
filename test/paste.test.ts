/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import {
  mapPaste,
  parseClipboard,
  parseHtmlClipboard,
  reflowSingleRow,
} from "../Spreadsheet/services/paste";

describe("parseClipboard", () => {
  it("returns empty for empty input", () => {
    expect(parseClipboard("")).toEqual([]);
  });
  it("parses a single cell", () => {
    expect(parseClipboard("hello")).toEqual([["hello"]]);
  });
  it("splits tabs into columns", () => {
    expect(parseClipboard("a\tb\tc")).toEqual([["a", "b", "c"]]);
  });
  it("splits newlines into rows", () => {
    expect(parseClipboard("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("handles Windows CRLF line endings", () => {
    expect(parseClipboard("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("does not produce a trailing empty row", () => {
    expect(parseClipboard("a\nb\n")).toEqual([["a"], ["b"]]);
  });
  it("honours Excel double-quote quoting", () => {
    expect(parseClipboard('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
    expect(parseClipboard('"line1\nline2"\tx')).toEqual([["line1\nline2", "x"]]);
    expect(parseClipboard('"she said ""hi"""\tend')).toEqual([
      ['she said "hi"', "end"],
    ]);
  });
});

describe("parseHtmlClipboard", () => {
  it("parses an HTML table into rows", () => {
    const html =
      "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>";
    expect(parseHtmlClipboard(html)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
  it("keeps empty cells and trims whitespace", () => {
    const html = "<table><tr><td></td><td>  X  </td></tr></table>";
    expect(parseHtmlClipboard(html)).toEqual([["", "X"]]);
  });
  it("returns null when there is no table", () => {
    expect(parseHtmlClipboard("<div>nope</div>")).toBeNull();
    expect(parseHtmlClipboard("")).toBeNull();
  });
});

describe("reflowSingleRow", () => {
  it("re-chunks a tab-only single row using the column count", () => {
    expect(reflowSingleRow(["a", "1", "b", "2", "c", "3"], 2)).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ]);
  });
  it("drops a single stray leading empty cell", () => {
    expect(reflowSingleRow(["", "a", "1", "b", "2"], 2)).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });
  it("returns null when it cannot chunk cleanly", () => {
    expect(reflowSingleRow(["a", "b", "c"], 2)).toBeNull();
    expect(reflowSingleRow(["a", "b"], 2)).toBeNull();
  });
});

describe("mapPaste", () => {
  it("maps cells within bounds", () => {
    const grid = [
      ["a", "b"],
      ["c", "d"],
    ];
    expect(mapPaste(grid, 5, 5)).toEqual([
      { rowOffset: 0, colOffset: 0, text: "a" },
      { rowOffset: 0, colOffset: 1, text: "b" },
      { rowOffset: 1, colOffset: 0, text: "c" },
      { rowOffset: 1, colOffset: 1, text: "d" },
    ]);
  });
  it("clamps to the available rows and columns", () => {
    const grid = [
      ["a", "b", "c"],
      ["d", "e", "f"],
    ];
    expect(mapPaste(grid, 1, 2)).toEqual([
      { rowOffset: 0, colOffset: 0, text: "a" },
      { rowOffset: 0, colOffset: 1, text: "b" },
    ]);
  });
});

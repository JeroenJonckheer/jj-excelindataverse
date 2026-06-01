/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { mapPaste, parseClipboard } from "../Spreadsheet/services/paste";

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

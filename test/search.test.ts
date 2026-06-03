/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { cellMatches, replaceInText } from "../Spreadsheet/services/search";

describe("cellMatches", () => {
  it("matches a case-insensitive substring by default", () => {
    expect(cellMatches("Acme Corporation", "acme", { matchCase: false, wholeCell: false })).toBe(true);
    expect(cellMatches("Acme", "xyz", { matchCase: false, wholeCell: false })).toBe(false);
  });
  it("honours match case", () => {
    expect(cellMatches("Acme", "acme", { matchCase: true, wholeCell: false })).toBe(false);
    expect(cellMatches("Acme", "Acme", { matchCase: true, wholeCell: false })).toBe(true);
  });
  it("honours whole cell", () => {
    expect(cellMatches("Acme Corp", "Acme", { matchCase: false, wholeCell: true })).toBe(false);
    expect(cellMatches("Acme", "acme", { matchCase: false, wholeCell: true })).toBe(true);
  });
  it("never matches an empty query", () => {
    expect(cellMatches("anything", "", { matchCase: false, wholeCell: false })).toBe(false);
  });
});

describe("replaceInText", () => {
  it("replaces every occurrence (case-insensitive)", () => {
    expect(replaceInText("a-A-a", "a", "x", { matchCase: false, wholeCell: false })).toBe("x-x-x");
  });
  it("respects case sensitivity", () => {
    expect(replaceInText("a-A-a", "a", "x", { matchCase: true, wholeCell: false })).toBe("x-A-x");
  });
  it("replaces the whole cell only on a full match", () => {
    expect(replaceInText("Acme", "Acme", "Zeta", { matchCase: false, wholeCell: true })).toBe("Zeta");
    expect(replaceInText("Acme Corp", "Acme", "Zeta", { matchCase: false, wholeCell: true })).toBe(
      "Acme Corp",
    );
  });
  it("treats the query literally (regex characters are escaped)", () => {
    expect(replaceInText("a.b.c", ".", "-", { matchCase: false, wholeCell: false })).toBe("a-b-c");
  });
});

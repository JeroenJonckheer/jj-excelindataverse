/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/**
 * Pure find/replace helpers over a cell's display text. Kept separate from the
 * grid so the matching and replacing rules can be unit tested directly.
 */

export interface MatchOptions {
  /** Case-sensitive comparison. */
  matchCase: boolean;
  /** Match the whole cell rather than a substring. */
  wholeCell: boolean;
}

/** Whether the cell text matches the query under the given options. */
export function cellMatches(text: string, query: string, opts: MatchOptions): boolean {
  if (query === "") return false;
  if (opts.wholeCell) {
    return opts.matchCase ? text === query : text.toLowerCase() === query.toLowerCase();
  }
  return opts.matchCase
    ? text.includes(query)
    : text.toLowerCase().includes(query.toLowerCase());
}

/** Escapes a string for safe use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces the query with the replacement in the cell text. With "whole cell"
 * the entire value is replaced when it matches; otherwise every occurrence is
 * replaced (honouring case sensitivity).
 */
export function replaceInText(
  text: string,
  query: string,
  replaceWith: string,
  opts: MatchOptions,
): string {
  if (query === "") return text;
  if (opts.wholeCell) {
    return cellMatches(text, query, opts) ? replaceWith : text;
  }
  const re = new RegExp(escapeRegExp(query), opts.matchCase ? "g" : "gi");
  return text.replace(re, replaceWith);
}

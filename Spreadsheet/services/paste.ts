/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/**
 * Clipboard parsing for paste from Excel. Excel and other spreadsheets place
 * tab separated values on the clipboard, one line per row. Cells that contain
 * a tab, a newline or a double quote are wrapped in double quotes, and embedded
 * double quotes are doubled. This parser honours that quoting so that a block
 * copied from Excel maps back to the exact grid of cells.
 */

/**
 * Parses the HTML flavour of the clipboard. Excel, and most spreadsheets, place
 * a real <table> on the clipboard alongside the plain text - including in
 * Protected View. The table has unambiguous row and cell structure, so using it
 * avoids the guesswork of plain-text parsing (tab vs newline row separators,
 * stray leading cells). Returns null when there is no usable table.
 */
export function parseHtmlClipboard(html: string): string[][] | null {
  if (!html || typeof DOMParser === "undefined") return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
  const table = doc.querySelector("table");
  if (!table) return null;

  const nbsp = new RegExp(String.fromCharCode(160), "g");
  const rows: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    // Skip rows that belong to a table nested inside a cell - only this table's
    // own rows count.
    if (tr.closest("table") !== table) continue;
    // Only the row's direct cells, so a nested table's cells are not pulled in.
    const cells = Array.from(tr.children)
      .filter((el) => el.tagName === "TD" || el.tagName === "TH")
      .map((cell) => (cell.textContent ?? "").replace(nbsp, " ").trim());
    if (cells.length > 0) rows.push(cells);
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Recovers rows from a single long line of cells when the source dropped the
 * row separators (some copy paths serialise every row with tabs and no
 * newline). When the cell count is a clean multiple of the grid's column count
 * - allowing for a single stray empty cell at either end - the cells are
 * re-chunked into rows. Returns null when it cannot do so confidently.
 */
export function reflowSingleRow(
  cells: string[],
  columnCount: number,
): string[][] | null {
  if (columnCount <= 0 || cells.length < columnCount * 2) return null;
  let work = cells;
  if (work.length % columnCount === 1) {
    if (work[0].trim() === "") work = work.slice(1);
    else if (work[work.length - 1].trim() === "") work = work.slice(0, -1);
  }
  if (work.length % columnCount !== 0) return null;
  const rows: string[][] = [];
  for (let i = 0; i < work.length; i += columnCount) {
    rows.push(work.slice(i, i + columnCount));
  }
  return rows;
}

/** Parses a clipboard string into a rectangular-ish grid of string cells. */
export function parseClipboard(text: string): string[][] {
  if (text === "") return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && cell === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === "\t") {
      endCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Treat \r\n and a lone \r as a single row break.
      endRow();
      if (text[i + 1] === "\n") i += 1;
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  // Flush the final cell/row unless the input ended exactly on a row break.
  if (cell !== "" || row.length > 0) {
    endRow();
  }

  return rows;
}

/**
 * Given the parsed clipboard grid and the top-left target cell, produces the
 * list of (rowOffset, colOffset, text) targets to apply, clamped to the grid
 * bounds. A single copied cell pasted over a multi-cell selection is handled by
 * the caller; this helper deals with the common block-to-block case.
 */
export interface PasteTarget {
  rowOffset: number;
  colOffset: number;
  text: string;
}

export function mapPaste(
  grid: string[][],
  maxRows: number,
  maxCols: number,
): PasteTarget[] {
  const targets: PasteTarget[] = [];
  for (let r = 0; r < grid.length && r < maxRows; r++) {
    const cells = grid[r];
    for (let c = 0; c < cells.length && c < maxCols; c++) {
      targets.push({ rowOffset: r, colOffset: c, text: cells[c] });
    }
  }
  return targets;
}

/** Wraps a cell in double quotes (Excel style) when it contains a separator. */
function escapeTsvCell(value: string): string {
  if (/[\t\r\n"]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialises a grid of cells to tab separated text, the format Excel and other
 * spreadsheets read from the clipboard. Cells with tabs, newlines or quotes are
 * quoted so the block pastes back exactly.
 */
export function gridToTsv(grid: string[][]): string {
  return grid.map((row) => row.map(escapeTsvCell).join("\t")).join("\r\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Serialises a grid of cells to an HTML table, the rich clipboard flavour that
 * Excel prefers when present. Pairs with the plain-text TSV.
 */
export function gridToHtml(grid: string[][]): string {
  const body = grid
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table>${body}</table>`;
}

/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellAddress } from "./types";

/**
 * Pure keyboard navigation logic for the grid. Given the current cell, the key
 * that was pressed and the grid dimensions, it returns the cell that should
 * become active. Movement is clamped to the grid; Tab and Enter wrap to the
 * next or previous line so that editing flows the way it does in a spreadsheet.
 */

export type NavKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Tab"
  | "ShiftTab"
  | "Enter"
  | "ShiftEnter";

export interface GridDims {
  rowCount: number;
  colCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function nextCell(
  current: CellAddress,
  key: NavKey,
  dims: GridDims,
): CellAddress {
  const { rowCount, colCount } = dims;
  if (rowCount <= 0 || colCount <= 0) return current;

  const lastRow = rowCount - 1;
  const lastCol = colCount - 1;
  let { rowIndex, colIndex } = current;

  switch (key) {
    case "ArrowUp":
      rowIndex = clamp(rowIndex - 1, 0, lastRow);
      break;
    case "ArrowDown":
      rowIndex = clamp(rowIndex + 1, 0, lastRow);
      break;
    case "ArrowLeft":
      colIndex = clamp(colIndex - 1, 0, lastCol);
      break;
    case "ArrowRight":
      colIndex = clamp(colIndex + 1, 0, lastCol);
      break;
    case "Enter":
    case "ShiftEnter": {
      const delta = key === "Enter" ? 1 : -1;
      rowIndex = clamp(rowIndex + delta, 0, lastRow);
      break;
    }
    case "Tab": {
      if (colIndex < lastCol) {
        colIndex += 1;
      } else if (rowIndex < lastRow) {
        colIndex = 0;
        rowIndex += 1;
      }
      break;
    }
    case "ShiftTab": {
      if (colIndex > 0) {
        colIndex -= 1;
      } else if (rowIndex > 0) {
        colIndex = lastCol;
        rowIndex -= 1;
      }
      break;
    }
  }

  return { rowIndex, colIndex };
}

/** Maps a keyboard event's key and modifier into a NavKey, or null. */
export function toNavKey(key: string, shift: boolean): NavKey | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
      return key;
    case "Tab":
      return shift ? "ShiftTab" : "Tab";
    case "Enter":
      return shift ? "ShiftEnter" : "Enter";
    default:
      return null;
  }
}

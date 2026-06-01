/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellValue, ColumnDef } from "./types";
import { formatValue, isEmpty, parseInput } from "./format";
import { validateValue } from "./validation";

/**
 * Turns raw input (typed text or a pasted cell) into a resolved edit: the typed
 * value, the text to display while pending, and any validation message. Keeping
 * this pure lets both the keyboard editors and the paste handler share exactly
 * the same parsing and validation behaviour.
 */
export interface ResolvedEdit {
  value: CellValue;
  display: string;
  error: string | null;
}

/** Resolves a value-based edit (choice, boolean, lookup picked from a list). */
export function resolveValue(value: CellValue, column: ColumnDef): ResolvedEdit {
  return {
    value,
    display: formatValue(value, column),
    error: validateValue(value, column),
  };
}

/** Resolves a text-based edit for the given column. */
export function resolveText(text: string, column: ColumnDef): ResolvedEdit {
  // Empty input clears the cell. Validation then decides whether an empty value
  // is allowed for this column (a required column will report an error).
  if (isEmpty(text)) {
    return { value: null, display: "", error: validateValue(null, column) };
  }

  let value: CellValue;
  if (column.kind === "choice") {
    value = matchOption(text, column);
  } else if (column.kind === "boolean") {
    value = matchBoolean(text, column);
  } else {
    value = parseInput(text, column);
  }

  // A non-empty entry that fails to parse into a number or date is invalid -
  // it must not be silently treated as an empty (cleared) value.
  if (value === null && (column.kind === "number")) {
    return { value: null, display: text, error: "Enter a valid number." };
  }
  if (value === null && (column.kind === "date" || column.kind === "datetime")) {
    return { value: null, display: text, error: "Enter a valid date." };
  }

  const display = formatValue(value, column) || text;
  return { value, display, error: validateValue(value, column) };
}

/** Matches free text against a choice column's option labels or values. */
function matchOption(text: string, column: ColumnDef): CellValue {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const options = column.options ?? [];
  const byLabel = options.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLabel) return byLabel.value;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && options.some((o) => o.value === asNumber)) {
    return asNumber;
  }
  // Unknown text: keep it as the raw string so validation flags it.
  return trimmed;
}

/** Matches free text against a boolean column's labels or common tokens. */
function matchBoolean(text: string, column: ColumnDef): CellValue {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return null;
  const options = column.options ?? [];
  const trueLabel = options.find((o) => o.value === 1)?.label.toLowerCase();
  const falseLabel = options.find((o) => o.value === 0)?.label.toLowerCase();
  if (trimmed === trueLabel) return true;
  if (trimmed === falseLabel) return false;
  if (["yes", "true", "1", "ja"].includes(trimmed)) return true;
  if (["no", "false", "0", "nee"].includes(trimmed)) return false;
  return text;
}

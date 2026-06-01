/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { CellValue, ColumnDef, ValidationResult } from "./types";
import { decimalPlaces, isEmpty, isLookupValue } from "./format";

/**
 * Metadata-driven cell validation. Every rule below originates from the column
 * metadata supplied by Dataverse - nothing is invented. When a piece of
 * metadata is absent, the corresponding check is simply skipped.
 *
 * The function returns a human readable message for the first rule that fails,
 * or null when the value is valid.
 */

// Conservative, widely used patterns. They mirror the intent of the Dataverse
// text formats without trying to be stricter than the platform itself.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^(https?:\/\/|ftp:\/\/|www\.)[^\s]+$/i;
const PHONE_PATTERN = /^[+()\-.\s\d]{3,}$/;

export function validateValue(value: CellValue, column: ColumnDef): ValidationResult {
  // Required level. Only "required" blocks saving; "recommended" does not.
  if (isEmpty(value)) {
    if (column.required === "required") {
      return "This field is required.";
    }
    return null; // Empty optional values are always valid.
  }

  switch (column.kind) {
    case "text":
    case "multiline":
      return validateText(value, column);
    case "number":
      return validateNumber(value, column);
    case "choice":
      return validateChoice(value, column);
    case "multichoice":
      return validateMultiChoice(value, column);
    case "lookup":
      return validateLookup(value);
    case "boolean":
    case "date":
    case "datetime":
    case "readonly":
    default:
      return null;
  }
}

function validateText(value: CellValue, column: ColumnDef): ValidationResult {
  if (typeof value !== "string") return null;
  if (typeof column.maxLength === "number" && value.length > column.maxLength) {
    return `Maximum length is ${column.maxLength} characters.`;
  }
  switch (column.format) {
    case "email":
      return EMAIL_PATTERN.test(value) ? null : "Enter a valid email address.";
    case "url":
      return URL_PATTERN.test(value) ? null : "Enter a valid URL.";
    case "phone":
      return PHONE_PATTERN.test(value) ? null : "Enter a valid phone number.";
    default:
      return null;
  }
}

function validateNumber(value: CellValue, column: ColumnDef): ValidationResult {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Enter a valid number.";
  }
  if (typeof column.minValue === "number" && value < column.minValue) {
    return `Value must be at least ${column.minValue}.`;
  }
  if (typeof column.maxValue === "number" && value > column.maxValue) {
    return `Value must be at most ${column.maxValue}.`;
  }
  if (
    typeof column.precision === "number" &&
    decimalPlaces(value) > column.precision
  ) {
    return column.precision === 0
      ? "Enter a whole number."
      : `Use at most ${column.precision} decimal places.`;
  }
  return null;
}

function validateChoice(value: CellValue, column: ColumnDef): ValidationResult {
  const num = typeof value === "number" ? value : Number(value);
  const options = column.options ?? [];
  if (options.length === 0) return null;
  return options.some((o) => o.value === num)
    ? null
    : "Select a value from the list.";
}

function validateMultiChoice(value: CellValue, column: ColumnDef): ValidationResult {
  if (!Array.isArray(value)) return null;
  const options = column.options ?? [];
  if (options.length === 0) return null;
  const allValid = value.every((v) => options.some((o) => o.value === v));
  return allValid ? null : "Select values from the list.";
}

function validateLookup(value: CellValue): ValidationResult {
  if (!isLookupValue(value)) {
    return "Select an existing record.";
  }
  return value.id.trim().length > 0 ? null : "Select an existing record.";
}

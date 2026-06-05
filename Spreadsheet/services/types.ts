/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/**
 * Shared domain types for the spreadsheet control. These types are deliberately
 * free of any Power Apps Component Framework references so that the pure logic
 * (formatting, validation, paste parsing, navigation) can be unit tested in
 * isolation, without a host context.
 */

/** Logical editor kind derived from the Dataverse column data type. */
export type CellKind =
  | "text"
  | "multiline"
  | "number"
  | "date"
  | "datetime"
  | "choice"
  | "multichoice"
  | "boolean"
  | "lookup"
  | "readonly";

/** Requirement level taken straight from the column metadata. */
export type RequiredLevel = "none" | "recommended" | "required";

/** Special text formats reported by the column metadata. */
export type TextFormat = "text" | "email" | "phone" | "url";

/** A single option of a choice (option set) or boolean column. */
export interface ChoiceOption {
  value: number;
  label: string;
}

/** A lookup value: a reference to a single record of a target table. */
export interface LookupValue {
  id: string;
  name: string;
  entityType: string;
}

/** Any value a cell can hold once parsed from user input. */
export type CellValue =
  | string
  | number
  | boolean
  | Date
  | LookupValue
  | number[]
  | null;

/**
 * Everything the control needs to know about one column. Built from the dataset
 * view metadata and, where available, the Dataverse attribute metadata. No rule
 * is invented here - every constraint originates from the metadata.
 */
export interface ColumnDef {
  /** Logical name of the column. */
  name: string;
  /** Display name from the view metadata. */
  displayName: string;
  /** Raw PCF data type, e.g. "SingleLine.Text", "OptionSet", "Lookup.Simple". */
  dataType: string;
  /** Editor kind derived from the data type. */
  kind: CellKind;
  /** Whether the column can be edited inline. */
  editable: boolean;
  /** Requirement level from RequiredLevel metadata. */
  required: RequiredLevel;
  /** Maximum length for text columns. */
  maxLength?: number;
  /** Minimum value for numeric columns. */
  minValue?: number;
  /** Maximum value for numeric columns. */
  maxValue?: number;
  /** Number of decimal places allowed for numeric columns. */
  precision?: number;
  /** Special text format for single line text columns. */
  format?: TextFormat;
  /** Options for choice and boolean columns. */
  options?: ChoiceOption[];
  /** Target table logical names for lookup columns. */
  lookupTargets?: string[];
  /** Relative width hint from the view (visual size factor). */
  visualSizeFactor?: number;
  /**
   * Default value from the column metadata, shown on a new row (boolean and
   * choice columns). The server applies it on create, so it is display-only.
   */
  defaultValue?: CellValue;
  /** Whether the column is a Field-Level-Security secured field. */
  secured?: boolean;
}

/** Address of a single cell in the grid. */
export interface CellAddress {
  rowIndex: number;
  colIndex: number;
}

/** A pending change to a single cell, before it is saved to Dataverse. */
export interface PendingEdit {
  recordId: string;
  columnName: string;
  /** Editor kind, so the save path knows how to bind the value. */
  kind: CellKind;
  /** The new value to write. */
  value: CellValue;
  /** Display text shown while the edit is pending. */
  display: string;
}

/** Result of validating a single value against its column metadata. */
export type ValidationResult = string | null;

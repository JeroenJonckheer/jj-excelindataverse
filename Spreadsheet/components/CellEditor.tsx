/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Input } from "@fluentui/react-components";
import type { CellValue, ColumnDef, LookupValue } from "../services/types";
import type { NavKey } from "../services/navigation";
import { toNavKey } from "../services/navigation";
import { LookupEditor } from "./LookupEditor";

export interface CellEditorProps {
  column: ColumnDef;
  initialText: string;
  /** Commit raw text for text, number, date and datetime columns. */
  onCommitText: (text: string, nav: NavKey | null) => void;
  /** Commit a typed value for choice, boolean and lookup columns. */
  onCommitValue: (value: CellValue, nav: NavKey | null) => void;
  onCancel: () => void;
  searchLookup: (targets: string[], term: string) => Promise<LookupValue[]>;
}

/** Editor dispatcher: renders the right inline editor for the column kind. */
export const CellEditor: React.FC<CellEditorProps> = (props) => {
  const { column } = props;
  if (column.kind === "lookup") {
    return (
      <LookupEditor
        column={column}
        initialText={props.initialText}
        searchLookup={props.searchLookup}
        onCommitValue={(v, nav) => props.onCommitValue(v, nav)}
        onCancel={props.onCancel}
      />
    );
  }
  if (column.kind === "choice" || column.kind === "boolean") {
    return <SelectEditor {...props} />;
  }
  return <TextLikeEditor {...props} />;
};

/** Handles the navigation/commit/cancel keys shared by every editor. */
function useCommitKeys(
  getCommit: () => void,
  commitWithNav: (nav: NavKey) => void,
  onCancel: () => void,
) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav === "Enter" || nav === "ShiftEnter" || nav === "Tab" || nav === "ShiftTab") {
      e.preventDefault();
      e.stopPropagation();
      commitWithNav(nav);
    }
  };
}

const TextLikeEditor: React.FC<CellEditorProps> = ({
  column,
  initialText,
  onCommitText,
  onCancel,
}) => {
  const [text, setText] = React.useState(initialText);
  const textRef = React.useRef(text);
  textRef.current = text;
  const doneRef = React.useRef(false);

  const finish = (nav: NavKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommitText(textRef.current, nav);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  const onKeyDown = useCommitKeys(
    () => finish(null),
    (nav) => finish(nav),
    cancel,
  );

  return (
    <Input
      autoFocus
      appearance="filled-lighter"
      className="jj-sheet-input"
      value={text}
      aria-label={column.displayName}
      onChange={(_e, data) => setText(data.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(null)}
    />
  );
};

const SelectEditor: React.FC<CellEditorProps> = ({
  column,
  initialText,
  onCommitValue,
  onCancel,
}) => {
  const options = column.options ?? [];
  const initialValue = options.find((o) => o.label === initialText)?.value;
  const [value, setValue] = React.useState<string>(
    initialValue != null ? String(initialValue) : "",
  );
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const doneRef = React.useRef(false);
  const toCellValue = (v: string): CellValue => {
    if (v === "") return null;
    const num = Number(v);
    if (column.kind === "boolean") return num === 1;
    return num;
  };
  const finish = (nav: NavKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommitValue(toCellValue(valueRef.current), nav);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  const onKeyDown = useCommitKeys(
    () => finish(null),
    (nav) => finish(nav),
    cancel,
  );

  return (
    <select
      autoFocus
      className="jj-sheet-select"
      aria-label={column.displayName}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(null)}
    >
      <option value="">(empty)</option>
      {options.map((o) => (
        <option key={o.value} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

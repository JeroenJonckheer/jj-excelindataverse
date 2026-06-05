/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Input } from "@fluentui/react-components";
import type { CellValue, ColumnDef, LookupValue } from "../services/types";
import type { NavKey } from "../services/navigation";
import { toNavKey } from "../services/navigation";
import { LookupEditor } from "./LookupEditor";
import { DateEditor } from "./DateEditor";

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
  if (column.kind === "date" || column.kind === "datetime") {
    return (
      <DateEditor
        column={column}
        initialText={props.initialText}
        onCommitText={props.onCommitText}
        onCancel={props.onCancel}
      />
    );
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

  const commitKeys = useCommitKeys(
    () => finish(null),
    (nav) => finish(nav),
    cancel,
  );
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Up/Down commit the value and move, the way Excel does while editing.
    // (Left/Right stay as caret movement within the text.)
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish(e.key);
      return;
    }
    commitKeys(e);
  };

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

/**
 * Choice and boolean editor: a native select. The browser draws the dropdown
 * caret and renders the option list itself, so it is positioned correctly and
 * never clipped by the grid. We try to open it immediately on activation.
 */
const SelectEditor: React.FC<CellEditorProps> = ({
  column,
  initialText,
  onCommitValue,
  onCancel,
}) => {
  const options = column.options ?? [];
  const initialValue = options.find((o) => o.label === initialText)?.value;
  const ref = React.useRef<HTMLSelectElement>(null);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    el?.focus();
    // Open the dropdown right away where the browser supports it (Chromium).
    try {
      (el as unknown as { showPicker?: () => void })?.showPicker?.();
    } catch {
      // Not supported or not allowed; the caret is there to click.
    }
  }, []);

  const toCellValue = (v: string): CellValue => {
    if (v === "") return null;
    const num = Number(v);
    return column.kind === "boolean" ? num === 1 : num;
  };
  const commit = (nav: NavKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommitValue(toCellValue(ref.current?.value ?? ""), nav);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <select
      ref={ref}
      className="jj-sheet-select"
      aria-label={column.displayName}
      defaultValue={initialValue != null ? String(initialValue) : ""}
      onChange={() => commit(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          return;
        }
        const nav = toNavKey(e.key, e.shiftKey);
        if (nav === "Tab" || nav === "ShiftTab") {
          e.preventDefault();
          e.stopPropagation();
          commit(nav);
        }
      }}
      onBlur={() => cancel()}
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

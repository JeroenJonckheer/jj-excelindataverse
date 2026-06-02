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
import { DropdownList } from "./DropdownList";

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
    return <ChoiceEditor {...props} />;
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

interface ChoiceItem {
  value: CellValue;
  label: string;
}

/**
 * Choice and boolean editor: a dropdown that opens immediately when the cell is
 * activated, navigable with the arrow keys, committed with Enter, Tab or a click.
 */
const ChoiceEditor: React.FC<CellEditorProps> = ({
  column,
  initialText,
  onCommitValue,
  onCancel,
}) => {
  const toCellValue = (raw: number | null): CellValue => {
    if (raw === null) return null;
    return column.kind === "boolean" ? raw === 1 : raw;
  };
  const items: ChoiceItem[] = [
    { value: null, label: "(empty)" },
    ...(column.options ?? []).map((o) => ({
      value: toCellValue(o.value),
      label: o.label,
    })),
  ];
  const initialIndex = Math.max(
    items.findIndex((it) => it.label === initialText),
    0,
  );
  const [active, setActive] = React.useState(initialIndex);
  const activeRef = React.useRef(active);
  activeRef.current = active;
  const doneRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const choose = (value: CellValue, nav: NavKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommitValue(value, nav);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav === "Enter" || nav === "ShiftEnter" || nav === "Tab" || nav === "ShiftTab") {
      e.preventDefault();
      e.stopPropagation();
      choose(items[activeRef.current].value, nav);
    }
  };

  return (
    <div
      className="jj-sheet-choice"
      ref={containerRef}
      tabIndex={0}
      role="listbox"
      aria-label={column.displayName}
      onKeyDown={onKeyDown}
      onBlur={() => cancel()}
    >
      <DropdownList anchorRef={containerRef}>
        {items.map((it, i) => (
          <li
            key={it.label}
            role="option"
            aria-selected={i === active}
            className={
              i === active
                ? "jj-sheet-lookup-item jj-sheet-lookup-item-active"
                : "jj-sheet-lookup-item"
            }
            onMouseDown={(e) => {
              e.preventDefault();
              choose(it.value, null);
            }}
          >
            {it.label}
          </li>
        ))}
      </DropdownList>
    </div>
  );
};

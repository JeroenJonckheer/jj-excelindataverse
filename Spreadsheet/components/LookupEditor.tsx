/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Input, Spinner } from "@fluentui/react-components";
import type { ColumnDef, LookupValue } from "../services/types";
import type { NavKey } from "../services/navigation";
import { toNavKey } from "../services/navigation";

export interface LookupEditorProps {
  column: ColumnDef;
  initialText: string;
  searchLookup: (targets: string[], term: string) => Promise<LookupValue[]>;
  onCommitValue: (value: LookupValue | null, nav: NavKey | null) => void;
  onCancel: () => void;
}

/**
 * Lookup editor with type-ahead autocomplete. As the user types, the target
 * tables are searched and matching records are offered. Only a record picked
 * from the suggestions is committed, which guarantees the value references an
 * existing record. Clearing the text commits an empty (null) value.
 */
export const LookupEditor: React.FC<LookupEditorProps> = ({
  column,
  initialText,
  searchLookup,
  onCommitValue,
  onCancel,
}) => {
  const [text, setText] = React.useState(initialText);
  const [options, setOptions] = React.useState<LookupValue[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const targets = column.lookupTargets ?? [];
  const reqRef = React.useRef(0);

  React.useEffect(() => {
    const term = text.trim();
    if (term.length === 0) {
      setOptions([]);
      return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    searchLookup(targets, term)
      .then((results) => {
        if (reqRef.current === myReq) {
          setOptions(results);
          setActiveIndex(0);
        }
        return null;
      })
      .catch(() => {
        if (reqRef.current === myReq) setOptions([]);
        return null;
      })
      .finally(() => {
        if (reqRef.current === myReq) setLoading(false);
      });
    // targets is stable for the lifetime of the editor.
  }, [text]);

  const choose = (opt: LookupValue, nav: NavKey | null) => {
    onCommitValue(opt, nav);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav === "Enter" || nav === "Tab" || nav === "ShiftTab" || nav === "ShiftEnter") {
      e.preventDefault();
      e.stopPropagation();
      if (text.trim().length === 0) {
        onCommitValue(null, nav);
      } else if (options[activeIndex]) {
        choose(options[activeIndex], nav);
      } else {
        onCancel();
      }
    }
  };

  return (
    <div className="jj-sheet-lookup">
      <Input
        autoFocus
        appearance="filled-lighter"
        className="jj-sheet-input"
        value={text}
        aria-label={column.displayName}
        onChange={(_e, data) => setText(data.value)}
        onKeyDown={handleKeyDown}
      />
      {loading && (
        <div className="jj-sheet-lookup-status">
          <Spinner size="tiny" label="Searching" />
        </div>
      )}
      {!loading && options.length > 0 && (
        <ul className="jj-sheet-lookup-list" role="listbox" aria-label="Suggestions">
          {options.map((opt, i) => (
            <li
              key={`${opt.entityType}:${opt.id}`}
              role="option"
              aria-selected={i === activeIndex}
              className={
                i === activeIndex
                  ? "jj-sheet-lookup-item jj-sheet-lookup-item-active"
                  : "jj-sheet-lookup-item"
              }
              onMouseDown={(e) => {
                e.preventDefault();
                choose(opt, null);
              }}
            >
              {opt.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

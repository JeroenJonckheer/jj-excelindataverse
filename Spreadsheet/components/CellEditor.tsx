/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
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

const CHEVRON = (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M5.2 7.4a.9.9 0 0 1 1.27 0L10 10.93l3.53-3.53a.9.9 0 1 1 1.27 1.27l-4.16 4.16a.9.9 0 0 1-1.27 0L5.2 8.67a.9.9 0 0 1 0-1.27Z"
    />
  </svg>
);

/**
 * Choice and boolean editor: a Dataverse-style dropdown rendered in the DOM as a
 * portal flyout (on document.body, so the cell's overflow:hidden cannot clip it).
 * Unlike a native <select>, an in-DOM list is visible in screen recordings and
 * looks the same on every OS. It opens immediately; arrow keys move the
 * highlight, Enter/Tab commit, Escape cancels, and clicking an option commits it.
 */
const SelectEditor: React.FC<CellEditorProps> = ({
  column,
  initialText,
  onCommitValue,
  onCancel,
}) => {
  // A leading "(empty)" entry lets the user clear the value.
  const items = React.useMemo(
    () => [
      { value: "", label: "(empty)" },
      ...(column.options ?? []).map((o) => ({ value: String(o.value), label: o.label })),
    ],
    [column.options],
  );
  const initialIndex = items.findIndex((it) => it.label === initialText);
  const [activeIndex, setActiveIndex] = React.useState(initialIndex < 0 ? 0 : initialIndex);
  const doneRef = React.useRef(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [flyoutStyle, setFlyoutStyle] = React.useState<React.CSSProperties | null>(null);

  React.useLayoutEffect(() => {
    triggerRef.current?.focus();
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 240;
    setFlyoutStyle({
      position: "fixed",
      left: Math.round(r.left),
      width: Math.max(Math.round(r.width), 160),
      ...(below
        ? { top: Math.round(r.bottom) + 2 }
        : { bottom: Math.round(window.innerHeight - r.top) + 2 }),
    });
  }, []);

  const toCellValue = (v: string): CellValue => {
    if (v === "") return null;
    const num = Number(v);
    return column.kind === "boolean" ? num === 1 : num;
  };
  const commitIndex = (index: number, nav: NavKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommitValue(toCellValue(items[index]?.value ?? ""), nav);
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
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav === "Enter" || nav === "ShiftEnter" || nav === "Tab" || nav === "ShiftTab") {
      e.preventDefault();
      e.stopPropagation();
      commitIndex(activeIndex, nav);
    }
  };

  const flyout = (
    <div className="jj-sheet-lookup-flyout jj-sheet-choice-flyout" style={flyoutStyle ?? undefined}>
      <ul className="jj-sheet-lookup-list" role="listbox" aria-label={`${column.displayName} options`}>
        {items.map((it, i) => (
          <li
            key={it.value || "(empty)"}
            role="option"
            aria-selected={i === activeIndex}
            className={
              i === activeIndex
                ? "jj-sheet-lookup-item jj-sheet-lookup-item-active"
                : "jj-sheet-lookup-item"
            }
            onMouseDown={(e) => {
              e.preventDefault();
              commitIndex(i, null);
            }}
          >
            <span className="jj-sheet-lookup-name">{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="jj-sheet-lookup" ref={anchorRef}>
      <button
        type="button"
        ref={triggerRef}
        className="jj-sheet-select jj-sheet-choice-trigger"
        aria-label={column.displayName}
        aria-haspopup="listbox"
        onKeyDown={onKeyDown}
        onBlur={() => cancel()}
      >
        <span className="jj-sheet-choice-value">{items[activeIndex]?.label ?? ""}</span>
        <span className="jj-sheet-lookup-searchico">{CHEVRON}</span>
      </button>
      {typeof document !== "undefined"
        ? ReactDOM.createPortal(flyout, document.body)
        : flyout}
    </div>
  );
};

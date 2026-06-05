/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
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

/** A friendly label for a target table's logical name (best effort). */
function entityLabel(logicalName: string): string {
  if (!logicalName) return "Records";
  return logicalName.charAt(0).toUpperCase() + logicalName.slice(1);
}

const RECORD_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M4.5 6h7M4.5 8.5h7M4.5 11h4" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

const SEARCH_ICON = (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8.5 3a5.5 5.5 0 0 1 4.38 8.84l3.64 3.64a.9.9 0 0 1-1.27 1.27l-3.64-3.64A5.5 5.5 0 1 1 8.5 3Zm0 1.8a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"
    />
  </svg>
);

/**
 * Lookup editor styled after the Dataverse lookup flyout: a search box with a
 * flyout below listing matching records. Polymorphic lookups (more than one
 * target table) get a tab per table, and the search runs against the selected
 * table - so the picked record references the right entity. Only a record from
 * the list is committed, which guarantees an existing reference; clearing the
 * text commits an empty (null) value.
 */
export const LookupEditor: React.FC<LookupEditorProps> = ({
  column,
  initialText,
  searchLookup,
  onCommitValue,
  onCancel,
}) => {
  const targets = column.lookupTargets ?? [];
  const polymorphic = targets.length > 1;
  const [text, setText] = React.useState(initialText);
  const [activeTarget, setActiveTarget] = React.useState(targets[0] ?? "");
  const [options, setOptions] = React.useState<LookupValue[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const reqRef = React.useRef(0);
  // The flyout is rendered in a portal so the cell's overflow:hidden cannot clip
  // it; it is positioned under (or above) the search box.
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [flyoutStyle, setFlyoutStyle] = React.useState<React.CSSProperties | null>(null);
  React.useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 280;
    setFlyoutStyle({
      position: "fixed",
      left: Math.round(r.left),
      width: Math.max(Math.round(r.width), 250),
      ...(below
        ? { top: Math.round(r.bottom) + 2 }
        : { bottom: Math.round(window.innerHeight - r.top) + 2 }),
    });
  }, []);

  React.useEffect(() => {
    // Search even on an empty term so opening the picker shows a browse list,
    // and against the selected target table only (polymorphic correctness).
    const term = text.trim();
    const pool = activeTarget ? [activeTarget] : targets;
    const myReq = ++reqRef.current;
    setLoading(true);
    searchLookup(pool, term)
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
  }, [text, activeTarget]);

  const choose = (opt: LookupValue, nav: NavKey | null) => onCommitValue(opt, nav);

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

  const flyout = (
    <div className="jj-sheet-lookup-flyout" style={flyoutStyle ?? undefined}>
      {polymorphic ? (
          <div className="jj-sheet-lookup-tabs" role="tablist" aria-label="Tables">
            {targets.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === activeTarget}
                className={
                  t === activeTarget
                    ? "jj-sheet-lookup-tab jj-sheet-lookup-tab-on"
                    : "jj-sheet-lookup-tab"
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  setActiveTarget(t);
                }}
              >
                {entityLabel(t)}
              </button>
            ))}
          </div>
        ) : (
          <div className="jj-sheet-lookup-header">{entityLabel(activeTarget)}</div>
        )}
        {loading && (
          <div className="jj-sheet-lookup-status">
            <Spinner size="tiny" label="Searching" />
          </div>
        )}
        {!loading && options.length > 0 && (
          <ul className="jj-sheet-lookup-list" role="listbox" aria-label="Records">
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
                <span className="jj-sheet-lookup-ico">{RECORD_ICON}</span>
                <span className="jj-sheet-lookup-name">{opt.name}</span>
                {polymorphic && (
                  <span className="jj-sheet-lookup-sub">{entityLabel(opt.entityType)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      {!loading && options.length === 0 && (
        <div className="jj-sheet-lookup-empty">No records found.</div>
      )}
    </div>
  );

  return (
    <div className="jj-sheet-lookup" ref={anchorRef}>
      <Input
        autoFocus
        appearance="filled-lighter"
        className="jj-sheet-input"
        value={text}
        aria-label={column.displayName}
        contentAfter={<span className="jj-sheet-lookup-searchico">{SEARCH_ICON}</span>}
        onChange={(_e, data) => setText(data.value)}
        onKeyDown={handleKeyDown}
      />
      {typeof document !== "undefined"
        ? ReactDOM.createPortal(flyout, document.body)
        : flyout}
    </div>
  );
};

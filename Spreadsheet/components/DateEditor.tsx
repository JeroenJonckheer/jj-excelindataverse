/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { Input } from "@fluentui/react-components";
import type { ColumnDef } from "../services/types";
import type { NavKey } from "../services/navigation";
import { toNavKey } from "../services/navigation";
import { parseDate } from "../services/format";

export interface DateEditorProps {
  column: ColumnDef;
  initialText: string;
  onCommitText: (text: string, nav: NavKey | null) => void;
  onCancel: () => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function two(n: number): string {
  return String(n).padStart(2, "0");
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const CAL_ICON = (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 2.5a.8.8 0 0 1 .8.8V4h6.4v-.7a.8.8 0 1 1 1.6 0V4H16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h.6v-.7a.8.8 0 0 1 .8-.8ZM3.6 8v7c0 .22.18.4.4.4h12a.4.4 0 0 0 .4-.4V8H3.6Z"
    />
  </svg>
);

/**
 * Date editor styled after the Dataverse date field: a `dd/MMM/yy`-style text
 * box plus a calendar flyout (a month day-grid and a month-of-year panel). A day
 * (or typed value) is committed as text the grid's day-first parser accepts;
 * for date/time columns the existing time-of-day is kept.
 */
export const DateEditor: React.FC<DateEditorProps> = ({
  column,
  initialText,
  onCommitText,
  onCancel,
}) => {
  const isDateTime = column.kind === "datetime";
  const today = new Date();
  const initial = parseDate(initialText);
  const [text, setText] = React.useState(initialText);
  const [view, setView] = React.useState(() => {
    const base = initial ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const selected = parseDate(text);
  const doneRef = React.useRef(false);

  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [flyoutStyle, setFlyoutStyle] = React.useState<React.CSSProperties | null>(null);
  React.useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 330;
    setFlyoutStyle({
      position: "fixed",
      left: Math.round(r.left),
      ...(below
        ? { top: Math.round(r.bottom) + 2 }
        : { bottom: Math.round(window.innerHeight - r.top) + 2 }),
    });
  }, []);

  const commit = (value: string, nav: NavKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommitText(value, nav);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  const pick = (d: Date) => {
    if (isDateTime) {
      const base = selected ?? initial;
      const hh = base ? base.getHours() : 0;
      const mm = base ? base.getMinutes() : 0;
      commit(`${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(hh)}:${two(mm)}`, null);
    } else {
      commit(`${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      commit(text, e.key);
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav === "Enter" || nav === "ShiftEnter" || nav === "Tab" || nav === "ShiftTab") {
      e.preventDefault();
      e.stopPropagation();
      commit(text, nav);
    }
  };

  const first = new Date(view.year, view.month, 1);
  const lead = first.getDay();
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(view.year, view.month, 1 - lead + i));
  }

  const setMonth = (delta: number) =>
    setView((v) => {
      const m = v.month + delta;
      if (m < 0) return { year: v.year - 1, month: 11 };
      if (m > 11) return { year: v.year + 1, month: 0 };
      return { year: v.year, month: m };
    });

  const flyout = (
    <div className="jj-sheet-cal" style={flyoutStyle ?? undefined} role="dialog" aria-label="Choose a date">
      <div className="jj-sheet-cal-pane">
        <div className="jj-sheet-cal-head">
          <span className="jj-sheet-cal-title">
            {MONTHS_FULL[view.month]} {view.year}
          </span>
          <span className="jj-sheet-cal-navs">
            <button type="button" aria-label="Previous month" onMouseDown={(e) => { e.preventDefault(); setMonth(-1); }}>↑</button>
            <button type="button" aria-label="Next month" onMouseDown={(e) => { e.preventDefault(); setMonth(1); }}>↓</button>
          </span>
        </div>
        <div className="jj-sheet-cal-weekdays">
          {WEEKDAYS.map((d) => (
            <span key={d} className="jj-sheet-cal-wd">{d}</span>
          ))}
        </div>
        <div className="jj-sheet-cal-days">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === view.month;
            const isSel = !!selected && sameDay(d, selected);
            const cls = [
              "jj-sheet-cal-day",
              inMonth ? "" : "jj-sheet-cal-out",
              sameDay(d, today) ? "jj-sheet-cal-today" : "",
              isSel ? "jj-sheet-cal-sel" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={i}
                type="button"
                className={cls}
                aria-selected={isSel}
                aria-label={d.toDateString()}
                onMouseDown={(e) => { e.preventDefault(); pick(d); }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
      <div className="jj-sheet-cal-pane jj-sheet-cal-pane-year">
        <div className="jj-sheet-cal-head">
          <span className="jj-sheet-cal-title">{view.year}</span>
          <span className="jj-sheet-cal-navs">
            <button type="button" aria-label="Previous year" onMouseDown={(e) => { e.preventDefault(); setView((v) => ({ ...v, year: v.year - 1 })); }}>↑</button>
            <button type="button" aria-label="Next year" onMouseDown={(e) => { e.preventDefault(); setView((v) => ({ ...v, year: v.year + 1 })); }}>↓</button>
          </span>
        </div>
        <div className="jj-sheet-cal-months">
          {MONTHS.map((m, mi) => (
            <button
              key={m}
              type="button"
              className={mi === view.month ? "jj-sheet-cal-month jj-sheet-cal-month-on" : "jj-sheet-cal-month"}
              onMouseDown={(e) => { e.preventDefault(); setView((v) => ({ ...v, month: mi })); }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
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
        contentAfter={<span className="jj-sheet-lookup-searchico">{CAL_ICON}</span>}
        onChange={(_e, data) => setText(data.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(text, null)}
      />
      {typeof document !== "undefined"
        ? ReactDOM.createPortal(flyout, document.body)
        : flyout}
    </div>
  );
};

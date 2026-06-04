/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import type {
  CellAddress,
  CellValue,
  ColumnDef,
  LookupValue,
  PendingEdit,
} from "../services/types";
import type { GridRow } from "../services/dataset";
import {
  computeColumnWidths,
  fitColumnWidth,
  moveColumn,
  orderColumns,
} from "../services/columns";

/** Width (px) of the leading row-selection column. */
const SELECT_COL_WIDTH = 36;

/** Only virtualise rows past this count; small grids render in full. */
const VIRTUALIZE_THRESHOLD = 60;
/** Estimated row height (px) until a real row is measured. */
const ROW_HEIGHT_FALLBACK = 33;
/** Extra rows rendered above and below the viewport, to keep scrolling smooth. */
const OVERSCAN_ROWS = 8;

// Thumbtack (push pin) icon paths - the standard Material "push_pin", drawn as
// an outline when a column is not frozen and filled when it is.
const PIN_PATH_OUTLINE =
  "M14 4v5c0 1.12.37 2.16 1 3H9c.63-.84 1-1.88 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z";
const PIN_PATH_FILLED =
  "M16 9V4l1 0c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1l1 0v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z";
import { nextCell, toNavKey, type NavKey } from "../services/navigation";
import { resolveText, resolveValue } from "../services/edit";
import { isLookupValue, isEmpty, formatValue, valuesEqual } from "../services/format";
import { serverErrorMessage } from "../services/errors";
import type { BatchOp, BatchResult } from "../services/DataverseService";
import {
  parseClipboard,
  parseHtmlClipboard,
  reflowSingleRow,
  gridToTsv,
  gridToHtml,
} from "../services/paste";
import {
  aggregate,
  rangeBounds,
  rangeIncludes,
  rangeSize,
  type Aggregates,
} from "../services/selection";
import { planColumnFill } from "../services/fill";
import { cellMatches, replaceInText } from "../services/search";
import { FindReplaceBar } from "./FindReplaceBar";
import { CellEditor } from "./CellEditor";
import { Footer } from "./Footer";

export interface SpreadsheetGridProps {
  columns: ColumnDef[];
  rows: GridRow[];
  version: string;
  onSave: (recordId: string, edits: PendingEdit[]) => Promise<void>;
  onCreate: (edits: PendingEdit[]) => Promise<void>;
  onDelete: (recordId: string) => Promise<void>;
  /**
   * Commits a whole save in one batched request. When provided it is used
   * instead of the per-record onSave/onCreate/onDelete callbacks (which remain
   * the fallback for tests and any host without batch support).
   */
  onSaveBatch?: (ops: BatchOp[]) => Promise<BatchResult[]>;
  /** Called once after a batch of saves/creates/deletes has fully resolved. */
  onCommitted?: () => void;
  onOpenRecord: (recordId: string) => void;
  /** Opens a record referenced by a lookup value (its own table and id). */
  onOpenLookup?: (entityType: string, recordId: string) => void;
  searchLookup: (targets: string[], term: string) => Promise<LookupValue[]>;
  resolveLookup: (targets: string[], text: string) => Promise<LookupValue[]>;
  /** Reports the selected saved-record ids so the host command bar stays in sync. */
  onSelectionChange?: (recordIds: string[]) => void;
  /** Logical name of the column the view is currently sorted by, if any. */
  sortColumn?: string | null;
  /** Whether the current sort is descending. */
  sortDescending?: boolean;
  /** Requests a sort on a column (the host re-queries the dataset). */
  onSort?: (columnName: string) => void;
  /** Dataset paging info and "load more", surfaced in the footer. */
  paging?: {
    loaded: number;
    total: number;
    hasMore: boolean;
    onLoadMore: () => void;
  };
}

/** A pixel rectangle for an absolutely-positioned overlay. */
interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Prefix that marks an as-yet-unsaved new row. */
const NEW_ROW_PREFIX = "new-";
const isNewRow = (recordId: string) => recordId.startsWith(NEW_ROW_PREFIX);

interface Draft {
  value: CellValue;
  display: string;
}

interface Snapshot {
  drafts: Record<string, Draft>;
  errors: Record<string, string>;
  rowErrors: Record<string, string>;
  newRows: string[];
  pendingDeletes: string[];
}

const SEP = "";
const cellKey = (recordId: string, columnName: string) =>
  `${recordId}${SEP}${columnName}`;

function isPrintable(e: React.KeyboardEvent): boolean {
  return (
    e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
  );
}

/**
 * The spreadsheet grid. Owns the active cell, the pending edits, per-cell
 * validation state and the save flow. The data it renders is supplied as plain
 * props so the whole component can be exercised without a host context.
 */
export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  columns: inputColumns,
  rows,
  version,
  onSave,
  onCreate,
  onDelete,
  onSaveBatch,
  onCommitted,
  onOpenRecord,
  onOpenLookup,
  searchLookup,
  resolveLookup,
  onSelectionChange,
  sortColumn,
  sortDescending,
  onSort,
  paging,
}) => {
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState<CellAddress | null>(null);
  // Anchor of the rectangular selection. The range spans from here to `active`;
  // a plain click collapses it (anchor === active). Shift+click/arrow and mouse
  // drag extend it.
  const [anchor, setAnchor] = React.useState<CellAddress | null>(null);
  // The range last copied with Ctrl+C, shown as a marching-ants marquee until a
  // paste, Escape or a new copy.
  const [copyRange, setCopyRange] = React.useState<{ a: CellAddress; b: CellAddress } | null>(null);
  // Pixel rectangles (content coordinates) for the selection border and the copy
  // marquee overlays, measured from the DOM.
  const [selectionRect, setSelectionRect] = React.useState<OverlayRect | null>(null);
  const [copyRect, setCopyRect] = React.useState<OverlayRect | null>(null);
  // Mouse is held down and dragging a selection.
  const draggingRef = React.useRef(false);
  // Fill handle drag: filling true while dragging the corner handle; fillTo is
  // the cell the cursor is over (drives the preview and the applied fill).
  const fillingRef = React.useRef(false);
  const fillToRef = React.useRef<CellAddress | null>(null);
  const [fillTo, setFillTo] = React.useState<CellAddress | null>(null);
  // Move drag: grab the selection's border and drag the whole block to a new
  // area (the values move there, the source clears), like Excel.
  interface RangeBox { top: number; bottom: number; left: number; right: number }
  const movingRef = React.useRef(false);
  const moveFromRef = React.useRef<RangeBox | null>(null);
  const moveGrabRef = React.useRef<CellAddress | null>(null);
  const moveToRef = React.useRef<CellAddress | null>(null);
  const [moving, setMoving] = React.useState(false);
  const [moveTo, setMoveTo] = React.useState<CellAddress | null>(null);
  const [moveRect, setMoveRect] = React.useState<OverlayRect | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pasteNotice, setPasteNotice] = React.useState<string | null>(null);
  // Ids of new rows the user is adding but has not saved yet.
  const [newRows, setNewRows] = React.useState<string[]>([]);
  const newRowIdRef = React.useRef(0);
  // Rows selected via the leading checkbox column.
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  // Existing records marked for deletion; removed from Dataverse on save.
  const [pendingDeletes, setPendingDeletes] = React.useState<Set<string>>(new Set());
  // Records already deleted on the server but still present in the bound rows
  // until the dataset refresh comes back. Filtered out so the grid updates
  // immediately; pruned again once the refreshed rows no longer carry them.
  const [removedIds, setRemovedIds] = React.useState<Set<string>>(new Set());
  // Right-click context menu position and target record.
  const [menu, setMenu] = React.useState<{ x: number; y: number; recordId: string } | null>(null);
  // Manual per-column width overrides (pixels), keyed by column name.
  const [widthOverrides, setWidthOverrides] = React.useState<Record<string, number>>({});
  // Manual column display order (a list of column names), null = view order.
  const [columnOrder, setColumnOrder] = React.useState<string[] | null>(null);
  // Freeze columns up to and including this display index (null = none frozen).
  const [frozenColIndex, setFrozenColIndex] = React.useState<number | null>(null);
  // Find & replace bar state.
  const [findOpen, setFindOpen] = React.useState(false);
  const [findReplace, setFindReplace] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState("");
  const [findReplaceWith, setFindReplaceWith] = React.useState("");
  const [findMatchCase, setFindMatchCase] = React.useState(false);
  const [findWholeCell, setFindWholeCell] = React.useState(false);
  const [findIndex, setFindIndex] = React.useState(0);
  const dragColRef = React.useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = React.useState<string | null>(null);

  // The columns in their display order. Everything below works off this, so a
  // reorder flows through the header, body, widths, paste and navigation alike.
  const columns = React.useMemo(
    () => orderColumns(inputColumns, columnOrder),
    [inputColumns, columnOrder],
  );

  // Undo/redo history. Each user action (a committed edit, a delete or a paste)
  // records one snapshot of the pending state, so Ctrl+Z reverts the whole
  // action - including a paste that landed in the wrong place.
  const [past, setPast] = React.useState<Snapshot[]>([]);
  const [future, setFuture] = React.useState<Snapshot[]>([]);

  const snapshot = (): Snapshot => ({
    drafts,
    errors,
    rowErrors,
    newRows,
    pendingDeletes: Array.from(pendingDeletes),
  });
  const restore = (s: Snapshot) => {
    setDrafts(s.drafts);
    setErrors(s.errors);
    setRowErrors(s.rowErrors);
    setNewRows(s.newRows);
    setPendingDeletes(new Set(s.pendingDeletes));
  };
  const record = () => {
    setPast((p) => [...p, snapshot()]);
    setFuture([]);
    setPasteNotice(null);
  };
  const undo = () => {
    if (past.length === 0) return;
    setFuture((f) => [snapshot(), ...f]);
    setPast((p) => p.slice(0, -1));
    restore(past[past.length - 1]);
    setPasteNotice(null);
  };
  const redo = () => {
    if (future.length === 0) return;
    setPast((p) => [...p, snapshot()]);
    setFuture((f) => f.slice(1));
    restore(future[0]);
  };

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Track the grid's own width so columns can fill it the way the standard
  // Dynamics grid does. A ResizeObserver keeps this responsive to window and
  // panel resizes; we fall back to the window resize event where it is absent.
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Virtualisation: render only the rows around the viewport once the grid is
  // large. scrollTop is tracked (rAF-throttled) to recompute the window.
  const [scrollTop, setScrollTop] = React.useState(0);
  const [rowHeight, setRowHeight] = React.useState(ROW_HEIGHT_FALLBACK);
  const scrollRafRef = React.useRef(0);
  // Set when a new row is appended so the layout effect scrolls it into view in
  // the same gesture (otherwise a virtualized grid needs a second scroll).
  const scrollBottomRef = React.useRef(false);
  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      setScrollTop(el.scrollTop);
    });
  };

  const widths = React.useMemo(
    () => computeColumnWidths(columns, viewportWidth - SELECT_COL_WIDTH, widthOverrides),
    [columns, viewportWidth, widthOverrides],
  );
  const tableWidth =
    SELECT_COL_WIDTH + widths.reduce((a, b) => a + b, 0);

  // Left offset (px) for each column when it is frozen: it sits after the
  // selection column and any preceding columns.
  const leftOffsets = React.useMemo(() => {
    const offsets: number[] = [];
    let acc = SELECT_COL_WIDTH;
    for (let i = 0; i < widths.length; i++) {
      offsets[i] = acc;
      acc += widths[i];
    }
    return offsets;
  }, [widths]);
  const frozen = frozenColIndex != null;
  const toggleFreeze = (colIndex: number) => {
    setFrozenColIndex((prev) => (prev === colIndex ? null : colIndex));
  };


  // Metadata default values shown on a new row (boolean and choice columns).
  // Shown only - the server applies them on create - so a new row that the user
  // never fills stays "empty" and is ignored.
  const newRowDefaults = React.useMemo(() => {
    const raw: Record<string, CellValue> = {};
    const display: Record<string, string> = {};
    for (const col of columns) {
      if (col.defaultValue === undefined || col.defaultValue === null) continue;
      raw[col.name] = col.defaultValue;
      display[col.name] = formatValue(col.defaultValue, col);
    }
    return { raw, display };
  }, [columns]);

  // The rendered rows are the bound dataset rows (minus any already deleted on
  // the server but not yet dropped by the refresh) plus any unsaved new rows.
  const allRows: GridRow[] = React.useMemo(
    () => [
      ...(removedIds.size > 0
        ? rows.filter((r) => !removedIds.has(r.recordId))
        : rows),
      ...newRows.map((id) => ({
        recordId: id,
        raw: { ...newRowDefaults.raw },
        display: { ...newRowDefaults.display },
      })),
    ],
    [rows, removedIds, newRows, newRowDefaults],
  );

  // Reconcile local bookkeeping with the bound rows once a refresh arrives:
  // drop removed ids the dataset no longer returns, and prune the checkbox
  // selection to rows that still exist (so a stale "Delete selected (N)" or a
  // leftover removed-id can never linger after the data changes underneath).
  React.useEffect(() => {
    const bound = new Set(rows.map((r) => r.recordId));
    setRemovedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) if (bound.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    // Keep a selected id only if the dataset still carries it or it is a new
    // (unsaved) row; otherwise the deleted rows would keep "Delete selected (N)"
    // alive after the data changed underneath.
    const keep = new Set([...bound, ...newRows]);
    setSelectedRows((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) if (keep.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [rows, newRows]);
  const dims = { rowCount: allRows.length, colCount: columns.length };

  // Virtual window: which rows to actually render. Below the threshold we render
  // everything (so small grids and the tests are unchanged).
  const totalRows = allRows.length;
  const virtual = totalRows > VIRTUALIZE_THRESHOLD;
  const rowH = rowHeight || ROW_HEIGHT_FALLBACK;
  let virtualStart = 0;
  let virtualEnd = totalRows;
  if (virtual) {
    const visibleCount = Math.ceil((viewportHeight || 400) / rowH) + OVERSCAN_ROWS * 2;
    // Clamp the window so a stale/oversized scrollTop (e.g. after the view's
    // columns or row count changed) can never land past the data and blank the
    // grid - it falls back to the last full window instead.
    const maxStart = Math.max(0, totalRows - visibleCount);
    virtualStart = Math.max(0, Math.min(Math.floor(scrollTop / rowH) - OVERSCAN_ROWS, maxStart));
    virtualEnd = Math.min(totalRows, virtualStart + visibleCount);
  }
  const topPad = virtualStart * rowH;
  const bottomPad = Math.max(0, (totalRows - virtualEnd) * rowH);
  const visibleRows = virtual ? allRows.slice(virtualStart, virtualEnd) : allRows;

  // The current rectangular selection: from the anchor (or the active cell when
  // there is no anchor) to the active cell.
  const selStart = anchor ?? active;
  const selectionCount =
    active && selStart ? rangeSize(selStart, active) : active ? 1 : 0;
  const inSelection = (rowIndex: number, colIndex: number): boolean =>
    !!active &&
    !!selStart &&
    rangeIncludes(selStart, active, { rowIndex, colIndex });
  // The frame to draw: normally the selection, but while dragging the fill
  // handle it grows to include the target cells, the way Excel extends the
  // marching frame around the whole series as you drag.
  const frameBounds =
    active && selStart
      ? (() => {
          const b = rangeBounds(selStart, active);
          if (!fillTo) return b;
          return {
            top: Math.min(b.top, fillTo.rowIndex),
            bottom: Math.max(b.bottom, fillTo.rowIndex),
            left: b.left,
            right: b.right,
          };
        })()
      : null;
  // Measure a cell-range rectangle in the scroll content's coordinates, so an
  // absolutely-positioned overlay (selection border, copy marquee) lines up with
  // it and scrolls along with the grid.
  const measureRect = (b: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null): OverlayRect | null => {
    const sheet = containerRef.current;
    if (!sheet || !b) return null;
    const tl = sheet.querySelector(`td[data-row="${b.top}"][data-col="${b.left}"]`);
    const br = sheet.querySelector(`td[data-row="${b.bottom}"][data-col="${b.right}"]`);
    if (!tl || !br) return null;
    const sr = sheet.getBoundingClientRect();
    const a = (tl as HTMLElement).getBoundingClientRect();
    const c = (br as HTMLElement).getBoundingClientRect();
    return {
      left: Math.round(a.left - sr.left + sheet.scrollLeft),
      top: Math.round(a.top - sr.top + sheet.scrollTop),
      width: Math.round(c.right - a.left),
      height: Math.round(c.bottom - a.top),
    };
  };
  const rectsEqual = (x: OverlayRect | null, y: OverlayRect | null): boolean =>
    x === y ||
    (!!x && !!y && x.left === y.left && x.top === y.top && x.width === y.width && x.height === y.height);

  // The target rectangle a move drag would drop the block onto (same size as the
  // source, offset by the drag), for the preview outline.
  const moveBounds: RangeBox | null =
    moving && moveFromRef.current && moveTo
      ? {
          top: moveTo.rowIndex,
          left: moveTo.colIndex,
          bottom: moveTo.rowIndex + (moveFromRef.current.bottom - moveFromRef.current.top),
          right: moveTo.colIndex + (moveFromRef.current.right - moveFromRef.current.left),
        }
      : null;

  // Re-measure the overlays after every render; the equality guard stops the
  // setState from looping. Cheap (two querySelectors) and always accurate.
  React.useLayoutEffect(() => {
    const next = measureRect(frameBounds);
    setSelectionRect((prev) => (rectsEqual(prev, next) ? prev : next));
    const cb = copyRange ? rangeBounds(copyRange.a, copyRange.b) : null;
    const nextCopy = measureRect(cb);
    setCopyRect((prev) => (rectsEqual(prev, nextCopy) ? prev : nextCopy));
    const nextMove = measureRect(moveBounds);
    setMoveRect((prev) => (rectsEqual(prev, nextMove) ? prev : nextMove));
    // Keep the virtualisation row height in step with the real rendered height.
    const firstRow = containerRef.current?.querySelector(
      "tbody tr[data-record-id]",
    ) as HTMLElement | null;
    if (firstRow && firstRow.offsetHeight > 0) {
      setRowHeight((prev) => (prev === firstRow.offsetHeight ? prev : firstRow.offsetHeight));
    }
    // A row was just appended: scroll it into view now (and sync the virtual
    // window) so the user sees it without scrolling again.
    if (scrollBottomRef.current) {
      scrollBottomRef.current = false;
      const el = containerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        setScrollTop((prev) => (prev === el.scrollTop ? prev : el.scrollTop));
      }
    }
  });

  // A drag (selection or fill) releases anywhere. The handler is kept in a ref
  // so the single document listener always runs against the latest state.
  const onDocumentMouseUpRef = React.useRef<() => void>(() => undefined);
  React.useEffect(() => {
    const up = () => onDocumentMouseUpRef.current();
    // If focus leaves the window mid-drag (released outside the host iframe, an
    // alt-tab), abort any drag so it cannot silently complete on the next click.
    const cancelDrag = () => {
      if (!draggingRef.current && !fillingRef.current && !movingRef.current) return;
      draggingRef.current = false;
      fillingRef.current = false;
      movingRef.current = false;
      setFillTo(null);
      setMoving(false);
      setMoveTo(null);
    };
    document.addEventListener("mouseup", up);
    window.addEventListener("blur", cancelDrag);
    return () => {
      document.removeEventListener("mouseup", up);
      window.removeEventListener("blur", cancelDrag);
    };
  }, []);

  // The cells a fill drag would write to (beyond the source selection), for the
  // preview outline. Null when not filling or the cursor is back inside it.
  const fillPreview = React.useMemo(() => {
    if (!fillTo || !active || !selStart) return null;
    const b = rangeBounds(selStart, active);
    if (fillTo.rowIndex > b.bottom) {
      return { top: b.bottom + 1, bottom: fillTo.rowIndex, left: b.left, right: b.right };
    }
    if (fillTo.rowIndex < b.top) {
      return { top: fillTo.rowIndex, bottom: b.top - 1, left: b.left, right: b.right };
    }
    return null;
  }, [fillTo, active, selStart]);
  const inFillPreview = (rowIndex: number, colIndex: number): boolean =>
    !!fillPreview &&
    rowIndex >= fillPreview.top &&
    rowIndex <= fillPreview.bottom &&
    colIndex >= fillPreview.left &&
    colIndex <= fillPreview.right;

  // Keep keyboard focus on the grid shell when not actively editing a cell.
  React.useEffect(() => {
    if (!editing && active && containerRef.current) {
      containerRef.current.focus();
    }
  }, [editing, active]);

  // Mirror the checkbox selection into the host dataset so the standard command
  // bar (its Delete and other actions) operates on the same records.
  React.useEffect(() => {
    onSelectionChange?.(
      Array.from(selectedRows).filter((id) => !isNewRow(id)),
    );
  }, [selectedRows, onSelectionChange]);

  const valueOf = (row: GridRow, col: ColumnDef): CellValue => {
    const key = cellKey(row.recordId, col.name);
    return key in drafts ? drafts[key].value : row.raw[col.name];
  };
  const displayOf = (row: GridRow, col: ColumnDef): string => {
    const key = cellKey(row.recordId, col.name);
    return key in drafts ? drafts[key].display : row.display[col.name] ?? "";
  };

  // The original (saved) rows by id, so a committed edit can be compared against
  // the starting value and a no-op edit can be dropped instead of staying dirty.
  const originalById = React.useMemo(() => {
    const map = new Map<string, GridRow>();
    for (const r of rows) map.set(r.recordId, r);
    return map;
  }, [rows]);
  const originalOf = (recordId: string, col: ColumnDef): CellValue => {
    const orig = originalById.get(recordId);
    if (orig) return orig.raw[col.name];
    // A new row starts from its metadata defaults (shown but not yet a change).
    return newRowDefaults.raw[col.name] ?? null;
  };

  // Numeric aggregates for the status bar, like Excel. Only meaningful for a
  // multi-cell selection.
  const selectionStats: (Aggregates & { count: number }) | null =
    React.useMemo(() => {
      if (!active || !selStart || selectionCount <= 1) return null;
      const b = rangeBounds(selStart, active);
      const nums: number[] = [];
      for (let r = b.top; r <= b.bottom; r++) {
        const row = allRows[r];
        if (!row) continue;
        for (let c = b.left; c <= b.right; c++) {
          const col = columns[c];
          if (!col || col.kind !== "number") continue;
          const v = valueOf(row, col);
          if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
        }
      }
      return { count: selectionCount, ...aggregate(nums) };
    }, [active, anchor, selectionCount, allRows, columns, drafts]);

  // Find & replace: the cells whose display text matches the query.
  const matches = React.useMemo(() => {
    if (!findOpen || findQuery === "") return [] as CellAddress[];
    const opts = { matchCase: findMatchCase, wholeCell: findWholeCell };
    const out: CellAddress[] = [];
    for (let r = 0; r < allRows.length; r++) {
      const row = allRows[r];
      for (let c = 0; c < columns.length; c++) {
        if (cellMatches(displayOf(row, columns[c]), findQuery, opts)) {
          out.push({ rowIndex: r, colIndex: c });
        }
      }
    }
    return out;
  }, [findOpen, findQuery, findMatchCase, findWholeCell, allRows, columns, drafts]);
  const matchKeys = React.useMemo(
    () => new Set(matches.map((m) => `${m.rowIndex},${m.colIndex}`)),
    [matches],
  );
  const safeFindIndex = matches.length === 0 ? 0 : findIndex % matches.length;

  const setDraft = (
    recordId: string,
    col: ColumnDef,
    value: CellValue,
    display: string,
    error: string | null,
  ) => {
    const key = cellKey(recordId, col.name);
    // An edit that returns the cell to its original (saved) value is not a
    // change: drop the draft instead of leaving it marked as pending. Cells with
    // an error (invalid, or a pending lookup) are always kept.
    const isNoOp = !error && valuesEqual(value, originalOf(recordId, col));
    setDrafts((d) => {
      const next = { ...d };
      if (isNoOp) delete next[key];
      else next[key] = { value, display };
      return next;
    });
    setErrors((e) => {
      const nextErrors = { ...e };
      if (error) nextErrors[key] = error;
      else delete nextErrors[key];
      return nextErrors;
    });
    setRowErrors((re) => {
      if (!(recordId in re)) return re;
      const copy = { ...re };
      delete copy[recordId];
      return copy;
    });
  };

  const applyText = (recordId: string, col: ColumnDef, text: string) => {
    if (!col.editable || col.kind === "lookup") return;
    const resolved = resolveText(text, col);
    setDraft(recordId, col, resolved.value, resolved.display, resolved.error);
  };

  const commitTextAt = (
    rowIndex: number,
    colIndex: number,
    text: string,
  ) => {
    const col = columns[colIndex];
    const row = allRows[rowIndex];
    if (!col || !row) return;
    applyText(row.recordId, col, text);
  };

  const applyValue = (recordId: string, col: ColumnDef, value: CellValue) => {
    if (!col.editable) return;
    const resolved = resolveValue(value, col);
    setDraft(recordId, col, resolved.value, resolved.display, resolved.error);
  };

  const commitValueAt = (
    rowIndex: number,
    colIndex: number,
    value: CellValue,
  ) => {
    const col = columns[colIndex];
    const row = allRows[rowIndex];
    if (!col || !row) return;
    applyValue(row.recordId, col, value);
  };

  // Select a single cell, collapsing any range (anchor follows the active cell).
  const selectCell = (addr: CellAddress) => {
    setActive(addr);
    setAnchor(addr);
  };

  const moveBy = (from: CellAddress, nav: NavKey | null) => {
    setEditing(false);
    if (nav) selectCell(nextCell(from, nav, dims));
  };

  const beginEdit = (initial: string) => {
    setEditText(initial);
    setEditing(true);
  };

  // ---- Range selection by mouse ----

  const onCellMouseDown = (
    e: React.MouseEvent,
    rowIndex: number,
    colIndex: number,
  ) => {
    // While editing, leave the editor's input alone; clicking another cell is
    // handled by the click (it commits on blur and moves).
    if (editing) return;
    draggingRef.current = true;
    if (e.shiftKey && active) {
      // Extend from the existing anchor to here.
      setActive({ rowIndex, colIndex });
    } else {
      selectCell({ rowIndex, colIndex });
    }
  };

  const onCellMouseEnter = (
    e: React.MouseEvent,
    rowIndex: number,
    colIndex: number,
  ) => {
    // Self-heal a drag whose mouse-up was missed (for example released outside
    // the host iframe): if the primary button is no longer down, stop instead
    // of letting plain hover keep extending.
    const buttonUp = (e.buttons & 1) === 0;
    if (movingRef.current) {
      if (buttonUp) {
        movingRef.current = false;
        setMoving(false);
        return;
      }
      const from = moveFromRef.current;
      const grab = moveGrabRef.current;
      if (from && grab) {
        // Offset the whole block by how far the cursor moved from the grab cell,
        // clamped so the block stays inside the grid.
        let dRow = rowIndex - grab.rowIndex;
        let dCol = colIndex - grab.colIndex;
        dRow = Math.max(-from.top, Math.min(dRow, dims.rowCount - 1 - from.bottom));
        dCol = Math.max(-from.left, Math.min(dCol, dims.colCount - 1 - from.right));
        const to = { rowIndex: from.top + dRow, colIndex: from.left + dCol };
        moveToRef.current = to;
        setMoveTo(to);
      }
      return;
    }
    if (fillingRef.current) {
      if (buttonUp) {
        fillingRef.current = false;
        setFillTo(null);
        return;
      }
      const to = { rowIndex, colIndex };
      fillToRef.current = to;
      setFillTo(to);
      return;
    }
    if (!draggingRef.current) return;
    if (buttonUp) {
      draggingRef.current = false;
      return;
    }
    setActive({ rowIndex, colIndex });
  };

  // Resolves the grid cell under a viewport point, ignoring the overlays.
  const cellFromPoint = (x: number, y: number): CellAddress | null => {
    if (typeof document.elementFromPoint !== "function") return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const td = el?.closest?.("td[data-row]") as HTMLElement | null;
    if (!td) return null;
    const r = Number(td.getAttribute("data-row"));
    const c = Number(td.getAttribute("data-col"));
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    return { rowIndex: r, colIndex: c };
  };

  // Start dragging the selection's border to move the whole block.
  const onMoveStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editing || !active || !selStart) return;
    const from = rangeBounds(selStart, active);
    // The cell under the cursor at grab time (hide the band so the hit-test
    // reaches the cell beneath it), so the block follows the cursor naturally.
    const band = e.currentTarget as HTMLElement;
    const prev = band.style.pointerEvents;
    band.style.pointerEvents = "none";
    const grab = cellFromPoint(e.clientX, e.clientY) ?? { rowIndex: from.top, colIndex: from.left };
    band.style.pointerEvents = prev;
    movingRef.current = true;
    moveFromRef.current = from;
    moveGrabRef.current = grab;
    moveToRef.current = { rowIndex: from.top, colIndex: from.left };
    setMoving(true);
    setMoveTo({ rowIndex: from.top, colIndex: from.left });
  };

  // Apply the move: relocate every selected cell by the drag offset, clearing
  // the source. Only cells whose source and target columns are both editable
  // move; read-only or out-of-grid targets are left untouched (no data loss).
  const applyMove = () => {
    const from = moveFromRef.current;
    const to = moveToRef.current;
    if (!from || !to) return;
    const dRow = to.rowIndex - from.top;
    const dCol = to.colIndex - from.left;
    if (dRow === 0 && dCol === 0) return;

    interface Cap {
      srcId: string;
      srcCol: ColumnDef;
      value: CellValue;
      display: string;
      tgtRow: GridRow;
      tgtCol: ColumnDef;
    }
    const caps: Cap[] = [];
    for (let r = from.top; r <= from.bottom; r++) {
      const row = allRows[r];
      if (!row) continue;
      for (let c = from.left; c <= from.right; c++) {
        const srcCol = columns[c];
        const tgtRow = allRows[r + dRow];
        const tgtCol = columns[c + dCol];
        if (!srcCol?.editable || !tgtRow || !tgtCol?.editable) continue;
        caps.push({
          srcId: row.recordId,
          srcCol,
          value: valueOf(row, srcCol),
          display: displayOf(row, srcCol),
          tgtRow,
          tgtCol,
        });
      }
    }
    if (caps.length === 0) return;

    record();
    // Clear the moved sources first (captured above), then write the targets, so
    // an overlapping move keeps the values that land back on a source cell.
    for (const cap of caps) {
      if (cap.srcCol.kind === "lookup") applyValue(cap.srcId, cap.srcCol, null);
      else applyText(cap.srcId, cap.srcCol, "");
    }
    for (const cap of caps) {
      if (cap.tgtCol.kind === "lookup") {
        applyValue(cap.tgtRow.recordId, cap.tgtCol, isLookupValue(cap.value) ? cap.value : null);
      } else {
        applyText(cap.tgtRow.recordId, cap.tgtCol, cap.display);
      }
    }
    // Frame the block at its new location.
    setAnchor({ rowIndex: from.top + dRow, colIndex: from.left + dCol });
    setActive({ rowIndex: from.bottom + dRow, colIndex: from.right + dCol });
  };

  // Start dragging the fill handle from the selection's bottom-right corner.
  const onFillStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!active || !selStart) return;
    fillingRef.current = true;
    const b = rangeBounds(selStart, active);
    const corner = { rowIndex: b.bottom, colIndex: b.right };
    fillToRef.current = corner;
    setFillTo(corner);
  };

  // Apply the fill: continue each selected column down or up to the cursor row.
  const applyFill = () => {
    if (!active || !selStart) return;
    const to = fillToRef.current;
    if (!to) return;
    const b = rangeBounds(selStart, active);
    const downExtent = to.rowIndex - b.bottom;
    const upExtent = b.top - to.rowIndex;
    if (downExtent <= 0 && upExtent <= 0) return;
    const direction = downExtent >= upExtent ? "forward" : "backward";
    const targetRows: number[] = [];
    if (direction === "forward") {
      for (let r = b.bottom + 1; r <= to.rowIndex; r++) targetRows.push(r);
    } else {
      for (let r = b.top - 1; r >= to.rowIndex; r--) targetRows.push(r);
    }
    if (targetRows.length === 0) return;

    record();
    for (let c = b.left; c <= b.right; c++) {
      const col = columns[c];
      if (!col?.editable) continue;
      const sourceCells: { value: CellValue; display: string; error: string | null }[] = [];
      for (let r = b.top; r <= b.bottom; r++) {
        const row = allRows[r];
        sourceCells.push(
          row
            ? {
                value: valueOf(row, col),
                display: displayOf(row, col),
                error: errors[cellKey(row.recordId, col.name)] ?? null,
              }
            : { value: null, display: "", error: null },
        );
      }
      const sourceNumbers = sourceCells.map((s) =>
        typeof s.value === "number" && Number.isFinite(s.value) ? s.value : null,
      );
      const plan = planColumnFill(
        sourceNumbers,
        targetRows.length,
        direction,
        col.kind === "number",
      );
      targetRows.forEach((tr, i) => {
        const row = allRows[tr];
        if (!row) return;
        const item = plan[i];
        if (item.value !== null) {
          applyValue(row.recordId, col, item.value);
        } else {
          const src = sourceCells[item.sourceIndex] ?? sourceCells[0];
          if (col.kind === "lookup") {
            applyValue(row.recordId, col, src.value);
          } else {
            setDraft(row.recordId, col, src.value, src.display, src.error);
          }
        }
      });
    }

    // Select the whole resulting series (source + filled cells), so the frame
    // ends up around the entire range, like Excel.
    const top = Math.min(b.top, to.rowIndex);
    const bottom = Math.max(b.bottom, to.rowIndex);
    setAnchor({ rowIndex: top, colIndex: b.left });
    setActive({ rowIndex: bottom, colIndex: b.right });
  };

  // Reassigned every render so the document mouse-up listener sees fresh state.
  onDocumentMouseUpRef.current = () => {
    draggingRef.current = false;
    if (fillingRef.current) {
      fillingRef.current = false;
      applyFill();
      setFillTo(null);
    }
    if (movingRef.current) {
      movingRef.current = false;
      applyMove();
      setMoving(false);
      setMoveTo(null);
    }
  };

  const onCellClick = (
    e: React.MouseEvent,
    rowIndex: number,
    colIndex: number,
    row: GridRow,
    col: ColumnDef,
  ) => {
    const isEditingCell =
      active?.rowIndex === rowIndex && active?.colIndex === colIndex && editing;
    if (isEditingCell) return;
    if (e.shiftKey && active) {
      setActive({ rowIndex, colIndex });
      setEditing(false);
      return;
    }
    selectCell({ rowIndex, colIndex });
    // Choice and boolean cells open their dropdown on a single click, like a
    // spreadsheet pick-list.
    if (col.editable && (col.kind === "choice" || col.kind === "boolean")) {
      beginEdit(displayOf(row, col));
    } else {
      setEditing(false);
    }
  };

  // Copy the selected range to the clipboard as TSV (and an HTML table), so it
  // pastes straight into Excel or back into the grid.
  const onCopy = (e: React.ClipboardEvent) => {
    if (editing || !active || !selStart) return;
    const b = rangeBounds(selStart, active);
    const grid: string[][] = [];
    for (let r = b.top; r <= b.bottom; r++) {
      const row = allRows[r];
      const cells: string[] = [];
      for (let c = b.left; c <= b.right; c++) {
        const col = columns[c];
        cells.push(row && col ? displayOf(row, col) : "");
      }
      grid.push(cells);
    }
    if (grid.length === 0) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", gridToTsv(grid));
    e.clipboardData.setData("text/html", gridToHtml(grid));
    setCopyRange({ a: selStart, b: active });
  };

  // Add an empty new row at the bottom and select its first editable cell.
  const addRow = () => {
    record();
    const id = `${NEW_ROW_PREFIX}${++newRowIdRef.current}`;
    setNewRows((nr) => [...nr, id]);
    const firstEditable = columns.findIndex((c) => c.editable);
    setEditing(false);
    selectCell({ rowIndex: allRows.length, colIndex: Math.max(firstEditable, 0) });
    scrollBottomRef.current = true;
  };

  // True when the grid already ends in an empty, unsaved row - so we do not
  // stack blank rows.
  const lastRowIsEmptyNew = (): boolean => {
    const last = allRows[allRows.length - 1];
    return (
      !!last &&
      isNewRow(last.recordId) &&
      !columns.some((c) => cellKey(last.recordId, c.name) in drafts)
    );
  };

  // Extend the grid downward: select the trailing empty row if there is one,
  // otherwise add a new row. Triggered by ArrowDown on the last row and by
  // scrolling past the bottom - no button needed.
  const extendDown = () => {
    const firstEditable = Math.max(columns.findIndex((c) => c.editable), 0);
    if (lastRowIsEmptyNew()) {
      setEditing(false);
      selectCell({
        rowIndex: allRows.length - 1,
        colIndex: active?.colIndex ?? firstEditable,
      });
      scrollBottomRef.current = true;
      return;
    }
    addRow();
  };

  const wheelTsRef = React.useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY <= 0) return;
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 2) return;
    const now = Date.now();
    if (now - wheelTsRef.current < 500) return;
    wheelTsRef.current = now;
    extendDown();
  };

  // Drag the right edge of a header to resize that column.
  const onResizeStart = (e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startX = e.clientX;
    const startWidth = th.offsetWidth;
    const move = (ev: MouseEvent) => {
      const width = Math.max(48, startWidth + (ev.clientX - startX));
      setWidthOverrides((prev) => ({ ...prev, [columnName]: width }));
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  // Double-click the column border to auto-fit the column to its widest content
  // (header and visible cells), the way a spreadsheet does.
  const autoFitColumn = (columnName: string, colIndex: number) => {
    const el = containerRef.current;
    if (!el) return;
    const widths: number[] = [];
    const headerCells = el.querySelectorAll("thead th");
    const headerSpan = headerCells[colIndex + 1]?.querySelector("span");
    if (headerSpan) widths.push((headerSpan as HTMLElement).scrollWidth);
    el.querySelectorAll(`td[data-col="${colIndex}"] .jj-sheet-cell-text`).forEach(
      (s) => widths.push((s as HTMLElement).scrollWidth),
    );
    setWidthOverrides((prev) => ({ ...prev, [columnName]: fitColumnWidth(widths) }));
  };

  // ---- Column reorder by dragging a header ----

  const onColDragStart = (e: React.DragEvent, columnName: string) => {
    dragColRef.current = columnName;
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs data set for the drag to start.
    e.dataTransfer.setData("text/plain", columnName);
  };
  const onColDragOver = (e: React.DragEvent, columnName: string) => {
    if (!dragColRef.current || dragColRef.current === columnName) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== columnName) setDragOverCol(columnName);
  };
  const onColDrop = (e: React.DragEvent, columnName: string) => {
    e.preventDefault();
    const drag = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!drag || drag === columnName) return;
    setColumnOrder(moveColumn(columns.map((c) => c.name), drag, columnName));
    // Column indices change, so collapse the selection to avoid a stale range
    // and clear the freeze (its boundary is a positional index that would now
    // pin the wrong columns).
    setActive(null);
    setAnchor(null);
    setFrozenColIndex(null);
    setEditing(false);
  };
  const onColDragEnd = () => {
    dragColRef.current = null;
    setDragOverCol(null);
  };

  // ---- Row selection, deletion and opening ----

  const toggleRowSelected = (recordId: string) => {
    setSelectedRows((s) => {
      const next = new Set(s);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  // Anchor for Shift+click range selection on the leading checkbox column.
  // Stored as a record id (not an index) so it survives a re-render that
  // reorders the rows between the two clicks - which happens in a sorted grid
  // because selecting a row tells the host, and the host re-runs the view.
  const rowAnchorRef = React.useRef<string | null>(null);

  // Click on a row checkbox: a plain click toggles that row and becomes the new
  // anchor; Shift+click selects every row between the anchor and this row
  // (inclusive), like a spreadsheet. Both endpoints are resolved against the
  // current row order, so the range is always correct.
  const selectRowAt = (recordId: string, rowIndex: number, shift: boolean) => {
    if (shift && rowAnchorRef.current != null) {
      const anchorIndex = allRows.findIndex(
        (r) => r.recordId === rowAnchorRef.current,
      );
      if (anchorIndex >= 0) {
        const lo = Math.min(anchorIndex, rowIndex);
        const hi = Math.max(anchorIndex, rowIndex);
        setSelectedRows((s) => {
          const next = new Set(s);
          for (let r = lo; r <= hi; r++) {
            const rec = allRows[r];
            if (rec) next.add(rec.recordId);
          }
          return next;
        });
        return;
      }
    }
    rowAnchorRef.current = recordId;
    toggleRowSelected(recordId);
  };

  const allSelected =
    allRows.length > 0 && allRows.every((r) => selectedRows.has(r.recordId));
  const toggleSelectAll = () => {
    setSelectedRows(() =>
      allSelected ? new Set() : new Set(allRows.map((r) => r.recordId)),
    );
  };

  // Marks rows for deletion. New (unsaved) rows are dropped immediately; saved
  // records are flagged and removed from Dataverse on save. Ctrl+Z reverts.
  const deleteRows = (ids: string[]) => {
    if (ids.length === 0) return;
    record();
    const newToRemove = ids.filter(isNewRow);
    const existing = ids.filter((id) => !isNewRow(id));
    if (newToRemove.length > 0) {
      setNewRows((nr) => nr.filter((id) => !newToRemove.includes(id)));
      setDrafts((d) => {
        const copy = { ...d };
        for (const id of newToRemove)
          for (const col of columns) delete copy[cellKey(id, col.name)];
        return copy;
      });
    }
    if (existing.length > 0) {
      setPendingDeletes((pd) => {
        const next = new Set(pd);
        existing.forEach((id) => next.add(id));
        return next;
      });
    }
    setSelectedRows((s) => {
      const next = new Set(s);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setMenu(null);
  };

  const openRow = (recordId: string) => {
    setMenu(null);
    if (!isNewRow(recordId)) onOpenRecord(recordId);
  };

  // Duplicate a row into a new, unsaved row pre-filled with its editable values
  // (created in Dataverse on save). Read-only columns are skipped.
  const duplicateRow = (recordId: string) => {
    setMenu(null);
    const src = allRows.find((r) => r.recordId === recordId);
    if (!src) return;
    record();
    const id = `${NEW_ROW_PREFIX}${++newRowIdRef.current}`;
    setNewRows((nr) => [...nr, id]);
    for (const col of columns) {
      if (!col.editable) continue;
      const value = valueOf(src, col);
      if (isEmpty(value)) continue;
      applyValue(id, col, value);
    }
    const firstEditable = Math.max(columns.findIndex((c) => c.editable), 0);
    selectCell({ rowIndex: allRows.length, colIndex: firstEditable });
  };

  const openMenu = (e: React.MouseEvent, recordId: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, recordId });
  };
  const menuDelete = () => {
    if (!menu) return;
    const ids =
      selectedRows.size > 0 && selectedRows.has(menu.recordId)
        ? Array.from(selectedRows)
        : [menu.recordId];
    deleteRows(ids);
  };

  // Close the context menu on any outside click or Escape.
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
  }, [menu]);

  // Keyboard handling while a cell is selected but no editor is open.
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;

    // Undo / redo work on the whole grid, independent of the active cell.
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    // Escape clears the copy marquee (like Excel).
    if (e.key === "Escape" && copyRange) {
      setCopyRange(null);
      return;
    }

    if (!active) return;
    const col = columns[active.colIndex];
    const row = allRows[active.rowIndex];
    if (!col || !row) return;

    if (e.key === "Enter" || e.key === "F2") {
      if (col.editable) {
        e.preventDefault();
        beginEdit(displayOf(row, col));
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      // Clear every editable cell in the selection, like a spreadsheet.
      const b = rangeBounds(selStart ?? active, active);
      record();
      for (let r = b.top; r <= b.bottom; r++) {
        const rr = allRows[r];
        if (!rr) continue;
        for (let c = b.left; c <= b.right; c++) {
          const cc = columns[c];
          if (!cc?.editable) continue;
          if (cc.kind === "lookup") applyValue(rr.recordId, cc, null);
          else applyText(rr.recordId, cc, "");
        }
      }
      return;
    }
    // ArrowDown on the last row grows the grid by a row, the way a spreadsheet
    // keeps going (but Shift+ArrowDown extends the selection instead).
    if (
      e.key === "ArrowDown" &&
      !e.shiftKey &&
      active.rowIndex === dims.rowCount - 1
    ) {
      e.preventDefault();
      extendDown();
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav) {
      e.preventDefault();
      const dest = nextCell(active, nav, dims);
      // Shift+Arrow extends the range (anchor stays); any other move collapses.
      if (e.key.startsWith("Arrow") && e.shiftKey) {
        setActive(dest);
      } else {
        selectCell(dest);
      }
      return;
    }
    if (isPrintable(e) && col.editable) {
      e.preventDefault();
      beginEdit(e.key);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing) return;
    setCopyRange(null);
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (!html && !text) return;
    e.preventDefault();
    if (!active) {
      setPasteNotice("Select the top-left cell to paste into first.");
      return;
    }

    // Prefer the clipboard's HTML table (unambiguous rows and cells, works in
    // Excel Protected View too). Fall back to plain text, and from there to a
    // column-count based row reconstruction when the source dropped its row
    // separators.
    let grid = parseHtmlClipboard(html);
    if (!grid) {
      grid = parseClipboard(text);
      if (grid.length === 1 && grid[0].length > columns.length) {
        const reflowed = reflowSingleRow(grid[0], columns.length);
        if (reflowed) grid = reflowed;
      }
    }
    if (grid.length === 0) return;
    record();

    // Extend with new rows so a paste that runs past the end of the grid adds
    // rows instead of dropping data.
    const needed = active.rowIndex + grid.length - allRows.length;
    const added: string[] = [];
    for (let i = 0; i < needed; i++) {
      added.push(`${NEW_ROW_PREFIX}${++newRowIdRef.current}`);
    }
    if (added.length > 0) setNewRows((nr) => [...nr, ...added]);
    const effectiveRows = [
      ...allRows,
      ...added.map((id) => ({ recordId: id, raw: {}, display: {} }) as GridRow),
    ];

    let createdRows = 0;
    const lookupCells: { recordId: string; col: ColumnDef; text: string }[] = [];
    for (let r = 0; r < grid.length; r++) {
      const rowIndex = active.rowIndex + r;
      const row = effectiveRows[rowIndex];
      if (!row) break;
      if (isNewRow(row.recordId)) createdRows++;
      const cells = grid[r];
      for (let c = 0; c < cells.length; c++) {
        const colIndex = active.colIndex + c;
        if (colIndex >= columns.length) break;
        const col = columns[colIndex];
        if (!col.editable) continue;
        if (col.kind === "lookup") {
          // Mark the cell as pending and resolve it to a record afterwards.
          const pending = resolveText("", col); // an empty placeholder
          setDraft(
            row.recordId,
            col,
            pending.value,
            cells[c].trim(),
            cells[c].trim().length > 0 ? "Looking up record..." : pending.error,
          );
          lookupCells.push({ recordId: row.recordId, col, text: cells[c] });
        } else {
          applyText(row.recordId, col, cells[c]);
        }
      }
    }
    setPasteNotice(
      createdRows > 0
        ? `Pasted into ${createdRows} new row${createdRows === 1 ? "" : "s"}. Review and Save to create ${createdRows === 1 ? "it" : "them"}, or press Ctrl+Z to undo.`
        : null,
    );
    void resolveLookupCells(lookupCells);
  };

  // Resolves pasted lookup cells to records. Repeated values are de-duplicated
  // so a large paste makes one request per distinct value (and the service
  // caches across pastes).
  const resolveLookupCells = async (
    cells: { recordId: string; col: ColumnDef; text: string }[],
  ) => {
    const byValue = new Map<string, typeof cells>();
    for (const cell of cells) {
      const key = `${cell.col.name}::${cell.text.trim().toLowerCase()}`;
      const list = byValue.get(key) ?? [];
      list.push(cell);
      byValue.set(key, list);
    }

    for (const group of byValue.values()) {
      const { col, text } = group[0];
      const trimmed = text.trim();
      let value: LookupValue | null = null;
      let error: string | null = null;
      if (trimmed.length === 0) {
        error = col.required === "required" ? "This field is required." : null;
      } else {
        try {
          const matches = await resolveLookup(col.lookupTargets ?? [], trimmed);
          if (matches.length === 1) {
            value = matches[0];
          } else if (matches.length === 0) {
            error = `No matching record for "${trimmed}".`;
          } else {
            error = `Multiple records match "${trimmed}". Open the cell to choose.`;
          }
        } catch {
          error = `Could not look up "${trimmed}".`;
        }
      }
      for (const cell of group) {
        setDraft(
          cell.recordId,
          col,
          value,
          value ? value.name : cell.text.trim(),
          error,
        );
      }
    }
  };

  const dirtyCount = Object.keys(drafts).length;
  const errorCount = Object.keys(errors).length;
  const deleteCount = pendingDeletes.size;

  const handleSave = async () => {
    if ((dirtyCount === 0 && deleteCount === 0) || errorCount > 0 || saving) return;

    // Proactive, metadata-driven validation before sending: a new row being
    // created must have its required fields filled. (Edited cells are already
    // validated as they are entered; an untouched required cell on a new row
    // would otherwise only be caught by a server rejection.)
    const requiredErrors: Record<string, string> = {};
    for (const id of newRows) {
      const hasAnyDraft = columns.some((c) => cellKey(id, c.name) in drafts);
      if (!hasAnyDraft) continue; // an empty new row is ignored, not created
      for (const col of columns) {
        if (!col.editable || col.required !== "required") continue;
        const key = cellKey(id, col.name);
        // A required field counts as filled if it has a draft or a metadata
        // default the server will apply on create.
        const value = key in drafts ? drafts[key].value : col.defaultValue ?? null;
        if (isEmpty(value)) requiredErrors[key] = "This field is required.";
      }
    }
    if (Object.keys(requiredErrors).length > 0) {
      setErrors((e) => ({ ...e, ...requiredErrors }));
      return; // the invalid cells now block saving until they are filled
    }

    setSaving(true);

    // Group the pending edits per record.
    const byRecord = new Map<string, PendingEdit[]>();
    for (const key of Object.keys(drafts)) {
      const sepIndex = key.indexOf(SEP);
      const recordId = key.slice(0, sepIndex);
      const columnName = key.slice(sepIndex + 1);
      const col = columns.find((c) => c.name === columnName);
      if (!col) continue;
      const draft = drafts[key];
      const list = byRecord.get(recordId) ?? [];
      list.push({
        recordId,
        columnName,
        kind: col.kind,
        value: draft.value,
        display: draft.display,
      });
      byRecord.set(recordId, list);
    }

    // Build the operations: a create or update per edited record (a record
    // marked for deletion skips its edits), then a delete per pending deletion.
    const ops: BatchOp[] = [];
    for (const [recordId, edits] of byRecord.entries()) {
      if (pendingDeletes.has(recordId)) continue;
      ops.push({ recordId, kind: isNewRow(recordId) ? "create" : "update", edits });
    }
    for (const recordId of pendingDeletes) {
      ops.push({ recordId, kind: "delete" });
    }

    // Commit in one batched request when the host supports it; otherwise fall
    // back to one request per record (kept for tests and hosts without batch).
    let results: BatchResult[];
    if (onSaveBatch) {
      results = await onSaveBatch(ops);
    } else {
      results = await Promise.all(
        ops.map(async (op): Promise<BatchResult> => {
          try {
            if (op.kind === "create") await onCreate(op.edits ?? []);
            else if (op.kind === "update") await onSave(op.recordId, op.edits ?? []);
            else await onDelete(op.recordId);
            return { recordId: op.recordId, ok: true };
          } catch (err) {
            return { recordId: op.recordId, ok: false, error: serverErrorMessage(err) };
          }
        }),
      );
    }

    // Sort the outcomes: successes get their drafts cleared, failures keep them
    // with the server message shown on the row.
    const failures: Record<string, string> = {};
    const savedRecords: string[] = [];
    const deletedRecords: string[] = [];
    const kindOf = new Map(ops.map((o) => [o.recordId, o.kind]));
    for (const r of results) {
      if (r.ok) {
        if (kindOf.get(r.recordId) === "delete") deletedRecords.push(r.recordId);
        else savedRecords.push(r.recordId);
      } else {
        failures[r.recordId] = r.error ?? serverErrorMessage(null);
      }
    }

    // Clear the drafts that saved; keep the ones that failed so the user can
    // fix and retry. The rest of the changes are preserved.
    setDrafts((d) => {
      const copy = { ...d };
      for (const recordId of [...savedRecords, ...deletedRecords]) {
        for (const col of columns) delete copy[cellKey(recordId, col.name)];
      }
      return copy;
    });
    // Saved new rows leave the temporary list; the refreshed dataset now carries
    // them as real records.
    setNewRows((nr) => nr.filter((id) => !savedRecords.includes(id)));
    setPendingDeletes((pd) => {
      const next = new Set(pd);
      deletedRecords.forEach((id) => next.delete(id));
      return next;
    });
    // Drop the deleted rows from the grid right away (the dataset refresh below
    // is async; without this the just-deleted rows linger until it returns) and
    // clear them from the checkbox selection so "Delete selected (N)" resets.
    if (deletedRecords.length > 0) {
      setRemovedIds((prev) => new Set([...prev, ...deletedRecords]));
      setSelectedRows((prev) => {
        const next = new Set(prev);
        deletedRecords.forEach((id) => next.delete(id));
        return next;
      });
    }
    setActive(null);
    setRowErrors((re) => ({ ...re, ...failures }));
    setSaving(false);

    // One refresh, after every save/create/delete has resolved, so the dataset
    // reports a single consistent state instead of an intermediate one.
    if (savedRecords.length > 0 || deletedRecords.length > 0) {
      onCommitted?.();
    }
  };

  // ---- Find & replace ----

  const openFind = (replace: boolean) => {
    setFindOpen(true);
    setFindReplace((r) => r || replace);
    setFindIndex(0);
  };
  const goToMatch = (i: number) => {
    if (matches.length === 0) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    setFindIndex(idx);
    const m = matches[idx];
    selectCell(m);
    const el = containerRef.current?.querySelector(
      `td[data-row="${m.rowIndex}"][data-col="${m.colIndex}"]`,
    );
    (el as HTMLElement | null)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const replaceCurrent = () => {
    if (matches.length === 0) return;
    const m = matches[safeFindIndex];
    const col = columns[m.colIndex];
    const row = allRows[m.rowIndex];
    if (!col || !row || !col.editable || col.kind === "lookup") return;
    record();
    applyText(
      row.recordId,
      col,
      replaceInText(displayOf(row, col), findQuery, findReplaceWith, {
        matchCase: findMatchCase,
        wholeCell: findWholeCell,
      }),
    );
  };
  const replaceAll = () => {
    const targets = matches.filter((m) => {
      const col = columns[m.colIndex];
      return !!col && col.editable && col.kind !== "lookup";
    });
    if (targets.length === 0) return;
    record();
    for (const m of targets) {
      const col = columns[m.colIndex];
      const row = allRows[m.rowIndex];
      if (!col || !row) continue;
      applyText(
        row.recordId,
        col,
        replaceInText(displayOf(row, col), findQuery, findReplaceWith, {
          matchCase: findMatchCase,
          wholeCell: findWholeCell,
        }),
      );
    }
  };

  // Open find (Ctrl+F) and replace (Ctrl+H) from anywhere in the control.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        openFind(false);
      } else if (k === "h") {
        e.preventDefault();
        openFind(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const footerMessage =
    Object.values(rowErrors)[0] ?? Object.values(errors)[0] ?? pasteNotice ?? null;

  return (
    <div className="jj-sheet-root">
      {findOpen && (
        <FindReplaceBar
          replace={findReplace}
          query={findQuery}
          replaceWith={findReplaceWith}
          matchCase={findMatchCase}
          wholeCell={findWholeCell}
          count={matches.length}
          current={matches.length === 0 ? 0 : safeFindIndex + 1}
          onQuery={(v) => {
            setFindQuery(v);
            setFindIndex(0);
          }}
          onReplaceWith={setFindReplaceWith}
          onToggleCase={() => setFindMatchCase((v) => !v)}
          onToggleWhole={() => setFindWholeCell((v) => !v)}
          onToggleReplace={() => setFindReplace((v) => !v)}
          onPrev={() => goToMatch(safeFindIndex - 1)}
          onNext={() => goToMatch(safeFindIndex + 1)}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div
        className="jj-sheet"
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-label="Dataverse spreadsheet"
        onKeyDown={onGridKeyDown}
        onPaste={onPaste}
        onCopy={onCopy}
        onWheel={onWheel}
        onScroll={onScroll}
      >
        <table className="jj-sheet-table" style={{ width: `${tableWidth}px` }}>
          <colgroup>
            <col className="jj-sheet-select-col" />
            {columns.map((c, i) => (
              <col key={c.name} style={{ width: `${widths[i]}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className={
                  frozen
                    ? "jj-sheet-th jj-sheet-select-th jj-sheet-select-frozen"
                    : "jj-sheet-th jj-sheet-select-th"
                }
                style={frozen ? { left: 0 } : undefined}
              >
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              {columns.map((c, i) => {
                const sorted = sortColumn === c.name;
                const ariaSort = sorted
                  ? sortDescending
                    ? "descending"
                    : "ascending"
                  : "none";
                const isFrozen = frozenColIndex != null && i <= frozenColIndex;
                const thClasses = [
                  "jj-sheet-th",
                  onSort ? "jj-sheet-th-sortable" : "",
                  isFrozen ? "jj-sheet-col-frozen" : "",
                  frozenColIndex === i ? "jj-sheet-col-frozen-edge" : "",
                  dragOverCol === c.name ? "jj-sheet-th-dragover" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th
                    key={c.name}
                    scope="col"
                    className={thClasses}
                    style={isFrozen ? { left: `${leftOffsets[i]}px` } : undefined}
                    aria-sort={ariaSort}
                    draggable
                    onClick={() => onSort?.(c.name)}
                    onDragStart={(e) => onColDragStart(e, c.name)}
                    onDragOver={(e) => onColDragOver(e, c.name)}
                    onDrop={(e) => onColDrop(e, c.name)}
                    onDragEnd={onColDragEnd}
                  >
                    <span>{c.displayName}</span>
                    {c.required === "required" && (
                      <span className="jj-sheet-required" aria-hidden="true">
                        {" *"}
                      </span>
                    )}
                    {sorted && (
                      <span
                        className={
                          sortDescending
                            ? "jj-sheet-sort jj-sheet-sort-desc"
                            : "jj-sheet-sort jj-sheet-sort-asc"
                        }
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={
                        isFrozen ? "jj-sheet-pin jj-sheet-pin-on" : "jj-sheet-pin"
                      }
                      role="button"
                      aria-label={
                        isFrozen ? "Unfreeze columns" : "Freeze up to this column"
                      }
                      title={
                        isFrozen ? "Unfreeze columns" : "Freeze up to this column"
                      }
                      draggable={false}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFreeze(i);
                      }}
                    >
                      <svg viewBox="-4 -4 32 32" width="13" height="13" aria-hidden="true">
                        {/* Material "push_pin": outline when free, filled when
                            frozen, tilted like a stuck thumbtack. */}
                        <path
                          transform="rotate(45 12 12)"
                          d={isFrozen ? PIN_PATH_FILLED : PIN_PATH_OUTLINE}
                        />
                      </svg>
                    </span>
                    <span
                      className="jj-sheet-resize-handle"
                      aria-hidden="true"
                      onMouseDown={(e) => onResizeStart(e, c.name)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        autoFitColumn(c.name, i);
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allRows.length === 0 && (
              <tr className="jj-sheet-empty-row">
                <td className="jj-sheet-empty-cell" colSpan={Math.max(columns.length + 1, 1)}>
                  No records to show.
                </td>
              </tr>
            )}
            {virtual && topPad > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length + 1}
                  style={{ height: topPad, padding: 0, border: 0 }}
                />
              </tr>
            )}
            {visibleRows.map((row, i) => {
              const rowIndex = virtualStart + i;
              const rowHasError = row.recordId in rowErrors;
              const rowSelected = selectedRows.has(row.recordId);
              const rowDeleting = pendingDeletes.has(row.recordId);
              const rowClasses = [
                "jj-sheet-row",
                isNewRow(row.recordId) ? "jj-sheet-row-new" : "",
                rowHasError ? "jj-sheet-row-error" : "",
                rowSelected ? "jj-sheet-row-selected" : "",
                rowDeleting ? "jj-sheet-row-delete" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={row.recordId}
                  className={rowClasses}
                  data-record-id={row.recordId}
                  onContextMenu={(e) => openMenu(e, row.recordId)}
                >
                  <td
                    className={
                      frozen
                        ? "jj-sheet-select-td jj-sheet-select-frozen"
                        : "jj-sheet-select-td"
                    }
                    style={frozen ? { left: 0 } : undefined}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={rowSelected}
                      onChange={() => {
                        /* selection handled in onClick (needs shiftKey) */
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectRowAt(row.recordId, rowIndex, e.shiftKey);
                      }}
                    />
                  </td>
                  {columns.map((col, colIndex) => {
                    const key = cellKey(row.recordId, col.name);
                    const isActive =
                      active?.rowIndex === rowIndex &&
                      active?.colIndex === colIndex;
                    const isEditingCell = isActive && editing;
                    const error = errors[key];
                    const dirty = key in drafts;
                    const selected =
                      selectionCount > 1 && inSelection(rowIndex, colIndex);
                    // The selection border is drawn as one continuous overlay
                    // rectangle (see selectionRect); cells only carry the tint and
                    // the frozen-column offset.
                    let cellStyle: React.CSSProperties | undefined;
                    const fillTarget = inFillPreview(rowIndex, colIndex);
                    const isFillCorner =
                      !!frameBounds &&
                      !editing &&
                      rowIndex === frameBounds.bottom &&
                      colIndex === frameBounds.right;
                    const isFrozenCell =
                      frozenColIndex != null && colIndex <= frozenColIndex;
                    if (isFrozenCell) {
                      cellStyle = { ...cellStyle, left: `${leftOffsets[colIndex]}px` };
                    }
                    const matchKey = `${rowIndex},${colIndex}`;
                    const isMatch = matchKeys.has(matchKey);
                    const isCurrentMatch =
                      isMatch &&
                      matches[safeFindIndex]?.rowIndex === rowIndex &&
                      matches[safeFindIndex]?.colIndex === colIndex;
                    const classNames = [
                      "jj-sheet-td",
                      col.editable ? "jj-sheet-td-editable" : "jj-sheet-td-readonly",
                      isFrozenCell ? "jj-sheet-col-frozen" : "",
                      frozenColIndex === colIndex ? "jj-sheet-col-frozen-edge" : "",
                      isActive ? "jj-sheet-td-active" : "",
                      selected ? "jj-sheet-td-selected" : "",
                      fillTarget ? "jj-sheet-td-fill" : "",
                      isMatch ? "jj-sheet-td-match" : "",
                      isCurrentMatch ? "jj-sheet-td-match-current" : "",
                      error ? "jj-sheet-td-invalid" : "",
                      dirty ? "jj-sheet-td-dirty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={col.name}
                        className={classNames}
                        style={cellStyle}
                        role="gridcell"
                        aria-invalid={error ? true : undefined}
                        title={error ?? undefined}
                        data-row={rowIndex}
                        data-col={colIndex}
                        data-cell-key={key}
                        onMouseDown={(e) => onCellMouseDown(e, rowIndex, colIndex)}
                        onMouseEnter={(e) => onCellMouseEnter(e, rowIndex, colIndex)}
                        onClick={(e) => onCellClick(e, rowIndex, colIndex, row, col)}
                        onDoubleClick={() => openRow(row.recordId)}
                      >
                        {isEditingCell ? (
                          <CellEditor
                            column={col}
                            initialText={editText}
                            searchLookup={searchLookup}
                            onCommitText={(text, nav) => {
                              record();
                              commitTextAt(rowIndex, colIndex, text);
                              moveBy({ rowIndex, colIndex }, nav);
                            }}
                            onCommitValue={(value, nav) => {
                              record();
                              commitValueAt(rowIndex, colIndex, value);
                              moveBy({ rowIndex, colIndex }, nav);
                            }}
                            onCancel={() => setEditing(false)}
                          />
                        ) : col.kind === "lookup" &&
                          isLookupValue(valueOf(row, col)) &&
                          onOpenLookup ? (
                          <span className="jj-sheet-cell-text">
                            <a
                              className="jj-sheet-link"
                              role="link"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                const v = valueOf(row, col);
                                if (isLookupValue(v)) {
                                  onOpenLookup(v.entityType, v.id);
                                }
                              }}
                            >
                              {displayOf(row, col)}
                            </a>
                          </span>
                        ) : (
                          <span className="jj-sheet-cell-text">
                            {displayOf(row, col)}
                          </span>
                        )}
                        {isFillCorner && (
                          <span
                            className="jj-sheet-fill-handle"
                            aria-hidden="true"
                            onMouseDown={onFillStart}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {virtual && bottomPad > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length + 1}
                  style={{ height: bottomPad, padding: 0, border: 0 }}
                />
              </tr>
            )}
          </tbody>
        </table>
        {selectionRect && !(copyRect && rectsEqual(selectionRect, copyRect)) && (
          <div
            className="jj-sheet-selection-overlay"
            style={{
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height,
            }}
            aria-hidden="true"
          >
            {/* Grab the border to move the whole block (only for a real range,
                so a single-cell click is never hijacked). */}
            {selectionCount > 1 && !editing && !moving && (
              <>
                <span className="jj-sheet-move-band jj-sheet-move-top" onMouseDown={onMoveStart} />
                <span className="jj-sheet-move-band jj-sheet-move-bottom" onMouseDown={onMoveStart} />
                <span className="jj-sheet-move-band jj-sheet-move-left" onMouseDown={onMoveStart} />
                <span className="jj-sheet-move-band jj-sheet-move-right" onMouseDown={onMoveStart} />
              </>
            )}
          </div>
        )}
        {moving && moveRect && (
          <div
            className="jj-sheet-move-preview"
            style={{
              left: moveRect.left,
              top: moveRect.top,
              width: moveRect.width,
              height: moveRect.height,
            }}
            aria-hidden="true"
          />
        )}
        {copyRect && (
          <div
            className="jj-sheet-marquee"
            style={{
              left: copyRect.left,
              top: copyRect.top,
              width: copyRect.width,
              height: copyRect.height,
            }}
            aria-hidden="true"
          />
        )}
      </div>
      {menu && (
        <ul
          className="jj-sheet-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {!isNewRow(menu.recordId) && (
            <li
              role="menuitem"
              className="jj-sheet-menu-item"
              onClick={() => openRow(menu.recordId)}
            >
              Open record
            </li>
          )}
          <li
            role="menuitem"
            className="jj-sheet-menu-item"
            onClick={() => duplicateRow(menu.recordId)}
          >
            Duplicate row
          </li>
          <li role="menuitem" className="jj-sheet-menu-item" onClick={menuDelete}>
            {selectedRows.size > 1 && selectedRows.has(menu.recordId)
              ? `Delete ${selectedRows.size} rows`
              : "Delete row"}
          </li>
        </ul>
      )}
      <Footer
        version={version}
        dirtyCount={dirtyCount}
        errorCount={errorCount}
        deleteCount={deleteCount}
        selectedCount={selectedRows.size}
        selectionStats={selectionStats}
        onDeleteSelected={() => deleteRows(Array.from(selectedRows))}
        saving={saving}
        message={footerMessage}
        onSave={handleSave}
        paging={paging}
      />
    </div>
  );
};

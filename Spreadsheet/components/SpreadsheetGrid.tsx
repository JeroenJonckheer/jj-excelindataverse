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
import { computePercentWidths } from "../services/columns";
import { nextCell, toNavKey, type NavKey } from "../services/navigation";
import { resolveText, resolveValue } from "../services/edit";
import { parseClipboard, parseHtmlClipboard, reflowSingleRow } from "../services/paste";
import { CellEditor } from "./CellEditor";
import { Footer } from "./Footer";

export interface SpreadsheetGridProps {
  columns: ColumnDef[];
  rows: GridRow[];
  version: string;
  onSave: (recordId: string, edits: PendingEdit[]) => Promise<void>;
  onCreate: (edits: PendingEdit[]) => Promise<void>;
  searchLookup: (targets: string[], term: string) => Promise<LookupValue[]>;
  resolveLookup: (targets: string[], text: string) => Promise<LookupValue[]>;
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
  columns,
  rows,
  version,
  onSave,
  onCreate,
  searchLookup,
  resolveLookup,
}) => {
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState<CellAddress | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pasteNotice, setPasteNotice] = React.useState<string | null>(null);
  // Ids of new rows the user is adding but has not saved yet.
  const [newRows, setNewRows] = React.useState<string[]>([]);
  const newRowIdRef = React.useRef(0);

  // Undo/redo history. Each user action (a committed edit, a delete or a paste)
  // records one snapshot of the pending state, so Ctrl+Z reverts the whole
  // action - including a paste that landed in the wrong place.
  const [past, setPast] = React.useState<Snapshot[]>([]);
  const [future, setFuture] = React.useState<Snapshot[]>([]);

  const snapshot = (): Snapshot => ({ drafts, errors, rowErrors, newRows });
  const restore = (s: Snapshot) => {
    setDrafts(s.drafts);
    setErrors(s.errors);
    setRowErrors(s.rowErrors);
    setNewRows(s.newRows);
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
  const widths = React.useMemo(() => computePercentWidths(columns), [columns]);

  // The rendered rows are the bound dataset rows plus any unsaved new rows.
  const allRows: GridRow[] = React.useMemo(
    () => [
      ...rows,
      ...newRows.map((id) => ({ recordId: id, raw: {}, display: {} })),
    ],
    [rows, newRows],
  );
  const dims = { rowCount: allRows.length, colCount: columns.length };

  // Keep keyboard focus on the grid shell when not actively editing a cell.
  React.useEffect(() => {
    if (!editing && active && containerRef.current) {
      containerRef.current.focus();
    }
  }, [editing, active]);

  const valueOf = (row: GridRow, col: ColumnDef): CellValue => {
    const key = cellKey(row.recordId, col.name);
    return key in drafts ? drafts[key].value : row.raw[col.name];
  };
  const displayOf = (row: GridRow, col: ColumnDef): string => {
    const key = cellKey(row.recordId, col.name);
    return key in drafts ? drafts[key].display : row.display[col.name] ?? "";
  };

  const setDraft = (
    recordId: string,
    col: ColumnDef,
    value: CellValue,
    display: string,
    error: string | null,
  ) => {
    const key = cellKey(recordId, col.name);
    setDrafts((d) => ({ ...d, [key]: { value, display } }));
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

  const moveBy = (from: CellAddress, nav: NavKey | null) => {
    setEditing(false);
    if (nav) setActive(nextCell(from, nav, dims));
  };

  const beginEdit = (initial: string) => {
    setEditText(initial);
    setEditing(true);
  };

  // Add an empty new row at the bottom and select its first editable cell.
  const addRow = () => {
    record();
    const id = `${NEW_ROW_PREFIX}${++newRowIdRef.current}`;
    setNewRows((nr) => [...nr, id]);
    const firstEditable = columns.findIndex((c) => c.editable);
    setEditing(false);
    setActive({ rowIndex: allRows.length, colIndex: Math.max(firstEditable, 0) });
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
      setActive({
        rowIndex: allRows.length - 1,
        colIndex: active?.colIndex ?? firstEditable,
      });
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
      if (col.editable) {
        e.preventDefault();
        record();
        if (col.kind === "lookup") {
          commitValueAt(active.rowIndex, active.colIndex, null);
        } else {
          commitTextAt(active.rowIndex, active.colIndex, "");
        }
      }
      return;
    }
    // ArrowDown on the last row grows the grid by a row, the way a spreadsheet
    // keeps going.
    if (e.key === "ArrowDown" && active.rowIndex === dims.rowCount - 1) {
      e.preventDefault();
      extendDown();
      return;
    }
    const nav = toNavKey(e.key, e.shiftKey);
    if (nav) {
      e.preventDefault();
      setActive(nextCell(active, nav, dims));
      return;
    }
    if (isPrintable(e) && col.editable) {
      e.preventDefault();
      beginEdit(e.key);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing) return;
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

  const handleSave = async () => {
    if (dirtyCount === 0 || errorCount > 0 || saving) return;
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

    const failures: Record<string, string> = {};
    const savedRecords: string[] = [];
    await Promise.all(
      Array.from(byRecord.entries()).map(async ([recordId, edits]) => {
        try {
          if (isNewRow(recordId)) {
            await onCreate(edits);
          } else {
            await onSave(recordId, edits);
          }
          savedRecords.push(recordId);
        } catch (err) {
          failures[recordId] =
            err instanceof Error ? err.message : String(err);
        }
      }),
    );

    // Clear the drafts that saved; keep the ones that failed so the user can
    // fix and retry. The rest of the changes are preserved.
    setDrafts((d) => {
      const copy = { ...d };
      for (const recordId of savedRecords) {
        for (const col of columns) delete copy[cellKey(recordId, col.name)];
      }
      return copy;
    });
    // Saved new rows leave the temporary list; the refreshed dataset now carries
    // them as real records.
    setNewRows((nr) => nr.filter((id) => !savedRecords.includes(id)));
    setActive(null);
    setRowErrors((re) => ({ ...re, ...failures }));
    setSaving(false);
  };

  const footerMessage =
    Object.values(rowErrors)[0] ?? Object.values(errors)[0] ?? pasteNotice ?? null;

  return (
    <div className="jj-sheet-root">
      <div
        className="jj-sheet"
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-label="Dataverse spreadsheet"
        onKeyDown={onGridKeyDown}
        onPaste={onPaste}
        onWheel={onWheel}
      >
        <table className="jj-sheet-table">
          <colgroup>
            {columns.map((c, i) => (
              <col key={c.name} style={{ width: `${widths[i]}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} scope="col" className="jj-sheet-th">
                  <span>{c.displayName}</span>
                  {c.required === "required" && (
                    <span className="jj-sheet-required" aria-hidden="true">
                      {" *"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, rowIndex) => {
              const rowHasError = row.recordId in rowErrors;
              const rowClasses = [
                "jj-sheet-row",
                isNewRow(row.recordId) ? "jj-sheet-row-new" : "",
                rowHasError ? "jj-sheet-row-error" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={row.recordId}
                  className={rowClasses}
                  data-record-id={row.recordId}
                >
                  {columns.map((col, colIndex) => {
                    const key = cellKey(row.recordId, col.name);
                    const isActive =
                      active?.rowIndex === rowIndex &&
                      active?.colIndex === colIndex;
                    const isEditingCell = isActive && editing;
                    const error = errors[key];
                    const dirty = key in drafts;
                    const classNames = [
                      "jj-sheet-td",
                      col.editable ? "jj-sheet-td-editable" : "jj-sheet-td-readonly",
                      isActive ? "jj-sheet-td-active" : "",
                      error ? "jj-sheet-td-invalid" : "",
                      dirty ? "jj-sheet-td-dirty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={col.name}
                        className={classNames}
                        role="gridcell"
                        aria-invalid={error ? true : undefined}
                        title={error ?? undefined}
                        data-row={rowIndex}
                        data-col={colIndex}
                        data-cell-key={key}
                        onClick={() => {
                          if (!isEditingCell) {
                            setEditing(false);
                            setActive({ rowIndex, colIndex });
                          }
                        }}
                        onDoubleClick={() => {
                          if (col.editable) {
                            setActive({ rowIndex, colIndex });
                            beginEdit(displayOf(row, col));
                          }
                        }}
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
                        ) : (
                          <span className="jj-sheet-cell-text">
                            {displayOf(row, col)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Footer
        version={version}
        dirtyCount={dirtyCount}
        errorCount={errorCount}
        saving={saving}
        message={footerMessage}
        onSave={handleSave}
      />
    </div>
  );
};

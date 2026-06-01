/*
 * Dataverse Spreadsheet
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
import { parseClipboard } from "../services/paste";
import { CellEditor } from "./CellEditor";
import { Footer } from "./Footer";

export interface SpreadsheetGridProps {
  columns: ColumnDef[];
  rows: GridRow[];
  version: string;
  onSave: (recordId: string, edits: PendingEdit[]) => Promise<void>;
  searchLookup: (targets: string[], term: string) => Promise<LookupValue[]>;
}

interface Draft {
  value: CellValue;
  display: string;
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
  searchLookup,
}) => {
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState<CellAddress | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const dims = { rowCount: rows.length, colCount: columns.length };
  const widths = React.useMemo(() => computePercentWidths(columns), [columns]);

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

  const commitTextAt = (
    rowIndex: number,
    colIndex: number,
    text: string,
  ) => {
    const col = columns[colIndex];
    const row = rows[rowIndex];
    if (!col || !row || !col.editable || col.kind === "lookup") return;
    const resolved = resolveText(text, col);
    setDraft(row.recordId, col, resolved.value, resolved.display, resolved.error);
  };

  const commitValueAt = (
    rowIndex: number,
    colIndex: number,
    value: CellValue,
  ) => {
    const col = columns[colIndex];
    const row = rows[rowIndex];
    if (!col || !row || !col.editable) return;
    const resolved = resolveValue(value, col);
    setDraft(row.recordId, col, resolved.value, resolved.display, resolved.error);
  };

  const moveBy = (from: CellAddress, nav: NavKey | null) => {
    setEditing(false);
    if (nav) setActive(nextCell(from, nav, dims));
  };

  const beginEdit = (initial: string) => {
    setEditText(initial);
    setEditing(true);
  };

  // Keyboard handling while a cell is selected but no editor is open.
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing || !active) return;
    const col = columns[active.colIndex];
    const row = rows[active.rowIndex];
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
        if (col.kind === "lookup") {
          commitValueAt(active.rowIndex, active.colIndex, null);
        } else {
          commitTextAt(active.rowIndex, active.colIndex, "");
        }
      }
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
    if (!active || editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const grid = parseClipboard(text);
    for (let r = 0; r < grid.length; r++) {
      const rowIndex = active.rowIndex + r;
      if (rowIndex >= rows.length) break;
      const cells = grid[r];
      for (let c = 0; c < cells.length; c++) {
        const colIndex = active.colIndex + c;
        if (colIndex >= columns.length) break;
        const col = columns[colIndex];
        if (!col.editable || col.kind === "lookup") continue;
        commitTextAt(rowIndex, colIndex, cells[c]);
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
          await onSave(recordId, edits);
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
    setRowErrors((re) => ({ ...re, ...failures }));
    setSaving(false);
  };

  const footerMessage =
    Object.values(rowErrors)[0] ?? Object.values(errors)[0] ?? null;

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
            {rows.map((row, rowIndex) => {
              const rowHasError = row.recordId in rowErrors;
              return (
                <tr
                  key={row.recordId}
                  className={rowHasError ? "jj-sheet-row jj-sheet-row-error" : "jj-sheet-row"}
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
                              commitTextAt(rowIndex, colIndex, text);
                              moveBy({ rowIndex, colIndex }, nav);
                            }}
                            onCommitValue={(value, nav) => {
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

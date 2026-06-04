/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Button, Spinner } from "@fluentui/react-components";
import type { Aggregates } from "../services/selection";

export interface FooterProps {
  version: string;
  dirtyCount: number;
  errorCount: number;
  deleteCount: number;
  selectedCount: number;
  /** Aggregates for the current multi-cell selection, Excel-style. */
  selectionStats?: (Aggregates & { count: number }) | null;
  saving: boolean;
  /** The most relevant message to show (validation or server error), if any. */
  message: string | null;
  onSave: () => void;
  onDeleteSelected: () => void;
  /** Dataset paging: "load more" grows the loaded set (the dataset accumulates). */
  paging?: {
    loaded: number;
    total: number;
    hasMore: boolean;
    onLoadMore: () => void;
  };
}

/** Formats an aggregate number: integers as-is, otherwise up to two decimals. */
function formatStat(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString()
    : rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Footer bar. Shows the current status or validation message, a delete action
 * for the selected rows, a save action that stays disabled until every changed
 * cell is valid, and the control version on the right.
 */
export const Footer: React.FC<FooterProps> = ({
  version,
  dirtyCount,
  errorCount,
  deleteCount,
  selectedCount,
  selectionStats,
  saving,
  message,
  onSave,
  onDeleteSelected,
  paging,
}) => {
  const pending = dirtyCount + deleteCount;
  const canSave = pending > 0 && errorCount === 0 && !saving;

  // The Excel-style status-bar aggregate for the current selection.
  let aggregateText: string | null = null;
  if (selectionStats && selectionStats.count > 1) {
    const parts = [`Count ${selectionStats.count.toLocaleString()}`];
    if (selectionStats.numericCount > 0 && selectionStats.average !== null) {
      parts.push(`Sum ${formatStat(selectionStats.sum)}`);
      parts.push(`Average ${formatStat(selectionStats.average)}`);
    }
    aggregateText = parts.join("  ·  ");
  }

  let status: string;
  if (message) {
    status = message;
  } else if (pending === 0) {
    status = "No pending changes.";
  } else {
    const parts: string[] = [];
    if (dirtyCount > 0) {
      parts.push(`${dirtyCount} pending change${dirtyCount === 1 ? "" : "s"}`);
    }
    if (deleteCount > 0) {
      parts.push(`${deleteCount} pending deletion${deleteCount === 1 ? "" : "s"}`);
    }
    status = `${parts.join(", ")}.`;
  }
  const tone =
    errorCount > 0 || message ? "jj-sheet-status-error" : "jj-sheet-status-info";

  return (
    <div className="jj-sheet-footer">
      <div className={`jj-sheet-status ${tone}`} role="status">
        {saving && <Spinner size="tiny" />}
        <span>{status}</span>
      </div>
      <div className="jj-sheet-footer-right">
        {paging && (
          <span className="jj-sheet-paging">
            <span className="jj-sheet-paging-info" aria-label="Loaded rows">
              {paging.total >= 0
                ? `1–${paging.loaded} of ${paging.total}`
                : `${paging.loaded} loaded`}
            </span>
            {paging.hasMore && (
              <Button
                size="small"
                appearance="subtle"
                aria-label="Load more rows"
                title="Load more rows"
                onClick={paging.onLoadMore}
              >
                Load more
              </Button>
            )}
          </span>
        )}
        {aggregateText && (
          <span className="jj-sheet-agg" aria-label="Selection summary">
            {aggregateText}
          </span>
        )}
        {selectedCount > 0 && (
          <Button
            appearance="secondary"
            size="small"
            disabled={saving}
            onClick={onDeleteSelected}
          >
            Delete selected ({selectedCount})
          </Button>
        )}
        <Button
          appearance="primary"
          size="small"
          disabled={!canSave}
          onClick={onSave}
        >
          Save changes
        </Button>
        <span className="jj-sheet-version" aria-label="Control version">
          JJ - Excel in Dataverse v{version}
        </span>
      </div>
    </div>
  );
};

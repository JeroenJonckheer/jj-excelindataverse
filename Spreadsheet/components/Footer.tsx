/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Button, Spinner } from "@fluentui/react-components";

export interface FooterProps {
  version: string;
  dirtyCount: number;
  errorCount: number;
  deleteCount: number;
  selectedCount: number;
  saving: boolean;
  /** The most relevant message to show (validation or server error), if any. */
  message: string | null;
  onSave: () => void;
  onDeleteSelected: () => void;
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
  saving,
  message,
  onSave,
  onDeleteSelected,
}) => {
  const pending = dirtyCount + deleteCount;
  const canSave = pending > 0 && errorCount === 0 && !saving;

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

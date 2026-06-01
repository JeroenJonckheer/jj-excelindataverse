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
  saving: boolean;
  /** The most relevant message to show (validation or server error), if any. */
  message: string | null;
  onSave: () => void;
}

/**
 * Footer bar. Shows the current status or validation message, a save action
 * that stays disabled until every changed cell is valid, and the control
 * version on the right.
 */
export const Footer: React.FC<FooterProps> = ({
  version,
  dirtyCount,
  errorCount,
  saving,
  message,
  onSave,
}) => {
  const canSave = dirtyCount > 0 && errorCount === 0 && !saving;
  const status =
    message ??
    (dirtyCount === 0
      ? "No pending changes."
      : `${dirtyCount} pending change${dirtyCount === 1 ? "" : "s"}.`);
  const tone = errorCount > 0 || message ? "jj-sheet-status-error" : "jj-sheet-status-info";

  return (
    <div className="jj-sheet-footer">
      <div className={`jj-sheet-status ${tone}`} role="status">
        {saving && <Spinner size="tiny" />}
        <span>{status}</span>
      </div>
      <div className="jj-sheet-footer-right">
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

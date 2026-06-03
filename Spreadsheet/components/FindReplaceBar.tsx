/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Button, Input } from "@fluentui/react-components";

export interface FindReplaceBarProps {
  replace: boolean;
  query: string;
  replaceWith: string;
  matchCase: boolean;
  wholeCell: boolean;
  /** Number of matches and the 1-based index of the current one (0 if none). */
  count: number;
  current: number;
  onQuery: (value: string) => void;
  onReplaceWith: (value: string) => void;
  onToggleCase: () => void;
  onToggleWhole: () => void;
  onToggleReplace: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

/**
 * Excel/VS Code-style find (and optional replace) bar, anchored top-right over
 * the grid. Replacing writes pending edits, so changes are saved (and undoable)
 * like any other edit.
 */
export const FindReplaceBar: React.FC<FindReplaceBarProps> = (props) => {
  return (
    <div className="jj-sheet-find" role="search">
      <div className="jj-sheet-find-row">
        <Input
          size="small"
          autoFocus
          className="jj-sheet-find-input"
          placeholder="Find"
          aria-label="Find"
          value={props.query}
          onChange={(_e, d) => props.onQuery(d.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.shiftKey ? props.onPrev : props.onNext)();
            if (e.key === "Escape") props.onClose();
          }}
        />
        <span className="jj-sheet-find-count" aria-label="Match count">
          {props.count > 0 ? `${props.current}/${props.count}` : "0/0"}
        </span>
        <Button
          size="small"
          appearance="subtle"
          aria-label="Previous match"
          title="Previous (Shift+Enter)"
          disabled={props.count === 0}
          onClick={props.onPrev}
        >
          {"↑"}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          aria-label="Next match"
          title="Next (Enter)"
          disabled={props.count === 0}
          onClick={props.onNext}
        >
          {"↓"}
        </Button>
        <Button
          size="small"
          appearance={props.matchCase ? "primary" : "subtle"}
          aria-label="Match case"
          aria-pressed={props.matchCase}
          title="Match case"
          onClick={props.onToggleCase}
        >
          Aa
        </Button>
        <Button
          size="small"
          appearance={props.wholeCell ? "primary" : "subtle"}
          aria-label="Whole cell"
          aria-pressed={props.wholeCell}
          title="Whole cell"
          onClick={props.onToggleWhole}
        >
          {"[ ]"}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          aria-label={props.replace ? "Hide replace" : "Show replace"}
          title="Replace"
          onClick={props.onToggleReplace}
        >
          {props.replace ? "–" : "»"}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          aria-label="Close"
          title="Close (Esc)"
          onClick={props.onClose}
        >
          {"×"}
        </Button>
      </div>
      {props.replace && (
        <div className="jj-sheet-find-row">
          <Input
            size="small"
            className="jj-sheet-find-input"
            placeholder="Replace with"
            aria-label="Replace with"
            value={props.replaceWith}
            onChange={(_e, d) => props.onReplaceWith(d.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") props.onClose();
            }}
          />
          <Button
            size="small"
            appearance="secondary"
            disabled={props.count === 0}
            onClick={props.onReplace}
          >
            Replace
          </Button>
          <Button
            size="small"
            appearance="secondary"
            disabled={props.count === 0}
            onClick={props.onReplaceAll}
          >
            Replace all
          </Button>
        </div>
      )}
    </div>
  );
};

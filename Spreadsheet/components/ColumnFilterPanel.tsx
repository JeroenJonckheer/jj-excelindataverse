/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { Button, Input } from "@fluentui/react-components";
import type { ColumnDef } from "../services/types";
import type { ColumnFilter } from "../services/filter";
import { isActiveFilter } from "../services/filter";

export interface ColumnFilterPanelProps {
  column: ColumnDef;
  current?: ColumnFilter;
  /** Apply a filter, or null to clear this column's filter. */
  onApply: (filter: ColumnFilter | null) => void;
  onClose: () => void;
}

/** Returns the parsed number, or null for blank/invalid input. */
function num(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * The small popover that filters one column. The inputs depend on the column
 * kind: contains (text), from/to (number, date) and a checkbox list (choice and
 * yes/no). Applying builds a ColumnFilter; an empty one clears the column.
 */
export const ColumnFilterPanel: React.FC<ColumnFilterPanelProps> = ({
  column,
  current,
  onApply,
  onClose,
}) => {
  const isNumber = column.kind === "number";
  const isDate = column.kind === "date" || column.kind === "datetime";
  const isChoice = column.kind === "choice" || column.kind === "boolean";

  const [contains, setContains] = React.useState(
    current?.kind === "text" ? current.contains : "",
  );
  const [min, setMin] = React.useState(
    current?.kind === "number" && current.min != null ? String(current.min) : "",
  );
  const [max, setMax] = React.useState(
    current?.kind === "number" && current.max != null ? String(current.max) : "",
  );
  const [from, setFrom] = React.useState(
    current?.kind === "date" ? current.from ?? "" : "",
  );
  const [to, setTo] = React.useState(current?.kind === "date" ? current.to ?? "" : "");
  const [values, setValues] = React.useState<number[]>(
    current?.kind === "choice" ? current.values : [],
  );

  const toggleValue = (v: number) =>
    setValues((vs) => (vs.includes(v) ? vs.filter((x) => x !== v) : [...vs, v]));

  const apply = () => {
    let filter: ColumnFilter;
    if (isNumber) {
      filter = { columnName: column.name, kind: "number", min: num(min), max: num(max) };
    } else if (isDate) {
      filter = {
        columnName: column.name,
        kind: "date",
        from: from || null,
        to: to || null,
      };
    } else if (isChoice) {
      filter = { columnName: column.name, kind: "choice", values };
    } else {
      filter = { columnName: column.name, kind: "text", contains };
    }
    onApply(isActiveFilter(filter) ? filter : null);
    onClose();
  };
  const clear = () => {
    onApply(null);
    onClose();
  };

  return (
    <div className="jj-sheet-filter-panel" role="dialog" aria-label="Filter column">
      {isNumber && (
        <div className="jj-sheet-filter-range">
          <Input
            size="small"
            type="number"
            placeholder="From"
            aria-label="From"
            value={min}
            onChange={(_e, d) => setMin(d.value)}
          />
          <Input
            size="small"
            type="number"
            placeholder="To"
            aria-label="To"
            value={max}
            onChange={(_e, d) => setMax(d.value)}
          />
        </div>
      )}
      {isDate && (
        <div className="jj-sheet-filter-range">
          <input
            className="jj-sheet-filter-date"
            type="date"
            aria-label="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="jj-sheet-filter-date"
            type="date"
            aria-label="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      )}
      {isChoice && (
        <ul className="jj-sheet-filter-options">
          {(column.options ?? []).map((o) => (
            <li key={o.value}>
              <label>
                <input
                  type="checkbox"
                  checked={values.includes(o.value)}
                  onChange={() => toggleValue(o.value)}
                />
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      {!isNumber && !isDate && !isChoice && (
        <Input
          size="small"
          placeholder="Contains"
          aria-label="Contains"
          autoFocus
          value={contains}
          onChange={(_e, d) => setContains(d.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
            if (e.key === "Escape") onClose();
          }}
        />
      )}
      <div className="jj-sheet-filter-actions">
        <Button appearance="primary" size="small" onClick={apply}>
          Apply
        </Button>
        <Button appearance="subtle" size="small" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
};

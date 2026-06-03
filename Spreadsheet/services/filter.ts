/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/**
 * Per-column quick filter model and translation to a Dataverse dataset filter.
 * The grid owns the per-column specs; this turns them into the condition
 * expression the host's dataset.filtering API expects, so filtering runs
 * server-side over the whole dataset (not just the loaded page).
 */

/** Dataverse ConditionOperator values used by the quick filter. */
export const COND_EQUAL = 0;
export const COND_GREATER_EQUAL = 4;
export const COND_LESS_EQUAL = 5;
export const COND_LIKE = 6;
export const COND_IN = 8;
/** And. */
export const FILTER_AND = 0;

export type ColumnFilter =
  | { columnName: string; kind: "text"; contains: string }
  | { columnName: string; kind: "number"; min: number | null; max: number | null }
  | { columnName: string; kind: "date"; from: string | null; to: string | null }
  | { columnName: string; kind: "choice"; values: number[] };

export interface DatasetCondition {
  attributeName: string;
  conditionOperator: number;
  value: unknown;
}
export interface DatasetFilter {
  filterOperator: number;
  conditions: DatasetCondition[];
}

/** Whether a column filter spec actually constrains anything. */
export function isActiveFilter(f: ColumnFilter): boolean {
  switch (f.kind) {
    case "text":
      return f.contains.trim().length > 0;
    case "number":
      return f.min != null || f.max != null;
    case "date":
      return !!f.from || !!f.to;
    case "choice":
      return f.values.length > 0;
  }
}

/** The dataset conditions a single column filter contributes. */
export function conditionsFor(f: ColumnFilter): DatasetCondition[] {
  switch (f.kind) {
    case "text": {
      const term = f.contains.trim();
      return term
        ? [{ attributeName: f.columnName, conditionOperator: COND_LIKE, value: `%${term}%` }]
        : [];
    }
    case "number": {
      const c: DatasetCondition[] = [];
      if (f.min != null)
        c.push({ attributeName: f.columnName, conditionOperator: COND_GREATER_EQUAL, value: f.min });
      if (f.max != null)
        c.push({ attributeName: f.columnName, conditionOperator: COND_LESS_EQUAL, value: f.max });
      return c;
    }
    case "date": {
      const c: DatasetCondition[] = [];
      if (f.from)
        c.push({ attributeName: f.columnName, conditionOperator: COND_GREATER_EQUAL, value: f.from });
      if (f.to)
        c.push({ attributeName: f.columnName, conditionOperator: COND_LESS_EQUAL, value: f.to });
      return c;
    }
    case "choice": {
      if (f.values.length === 0) return [];
      if (f.values.length === 1)
        return [{ attributeName: f.columnName, conditionOperator: COND_EQUAL, value: f.values[0] }];
      return [{ attributeName: f.columnName, conditionOperator: COND_IN, value: f.values }];
    }
  }
}

/**
 * Builds the combined dataset filter (AND of all column conditions), or null
 * when nothing is filtered - which the caller turns into clearFilter().
 */
export function buildDatasetFilter(filters: ColumnFilter[]): DatasetFilter | null {
  const conditions = filters.flatMap(conditionsFor);
  if (conditions.length === 0) return null;
  return { filterOperator: FILTER_AND, conditions };
}

/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
  type Theme,
} from "@fluentui/react-components";
import type { IInputs } from "../generated/ManifestTypes";
import type { ColumnDef, LookupValue, PendingEdit } from "../services/types";
import {
  buildColumns,
  buildRows,
  type DatasetColumnLike,
  type DatasetRecordLike,
  type GridRow,
} from "../services/dataset";
import { DataverseService, type IDataverseService } from "../services/DataverseService";
import { CONTROL_VERSION } from "../services/version";
import { SpreadsheetGrid } from "./SpreadsheetGrid";

export interface AppProps {
  context: ComponentFramework.Context<IInputs>;
  onChange: () => void;
  /**
   * Optional Dataverse service. The control creates a live one by default;
   * the test harness injects a deterministic mock so it can run offline.
   */
  service?: IDataverseService;
}

type Dataset = ComponentFramework.PropertyTypes.DataSet;

/** A column signature so we only rebuild/enrich when the columns truly change. */
function columnSignature(dataset: Dataset): string {
  return (dataset.columns ?? [])
    .map((c) => `${c.name}:${c.dataType}:${c.order}`)
    .join("|");
}

/**
 * Top-level shell. Builds the grid model from the bound dataset, enriches the
 * columns with Dataverse validation metadata, and wires saving and lookup
 * search to the Dataverse service.
 */
export const App: React.FC<AppProps> = ({ context, onChange, service }) => {
  const dataset = context.parameters.records;
  const entityName =
    (dataset as unknown as { getTargetEntityType?: () => string })
      .getTargetEntityType?.() ?? "";

  const ctxRef = React.useRef(context);
  ctxRef.current = context;
  const dataverse = React.useMemo<IDataverseService>(
    () => service ?? new DataverseService(ctxRef.current),
    [service],
  );

  const sig = columnSignature(dataset);
  const [columns, setColumns] = React.useState<ColumnDef[]>(() =>
    buildColumns((dataset.columns ?? []) as DatasetColumnLike[]),
  );

  // Rebuild the type-based columns whenever the view's columns change.
  React.useEffect(() => {
    setColumns(buildColumns((dataset.columns ?? []) as DatasetColumnLike[]));
  }, [sig]);

  // Enrich columns with metadata-driven validation rules.
  React.useEffect(() => {
    let cancelled = false;
    if (!entityName) return;
    const base = buildColumns((dataset.columns ?? []) as DatasetColumnLike[]);
    dataverse
      .enrichColumns(entityName, base)
      .then((enriched) => {
        if (!cancelled) setColumns(enriched);
        return null;
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [sig, entityName, dataverse]);

  const rows: GridRow[] = React.useMemo(() => {
    const ids = dataset.sortedRecordIds ?? [];
    const records = dataset.records as unknown as Record<string, DatasetRecordLike>;
    return buildRows(ids, records, columns);
  }, [columns, dataset.sortedRecordIds, dataset.records]);

  const theme: Theme = React.useMemo(() => {
    const dark = !!(context as unknown as {
      fluentDesignLanguage?: { isDarkTheme?: boolean };
    }).fluentDesignLanguage?.isDarkTheme;
    return dark ? webDarkTheme : webLightTheme;
  }, [context]);

  const onSave = React.useCallback(
    async (recordId: string, edits: PendingEdit[]) => {
      await dataverse.saveRecord(entityName, recordId, edits);
      const refreshable = dataset as unknown as { refresh?: () => void };
      refreshable.refresh?.();
      onChange();
    },
    [dataverse, entityName, dataset, onChange],
  );

  const onCreate = React.useCallback(
    async (edits: PendingEdit[]) => {
      await dataverse.createRecord(entityName, edits);
      const refreshable = dataset as unknown as { refresh?: () => void };
      refreshable.refresh?.();
      onChange();
    },
    [dataverse, entityName, dataset, onChange],
  );

  const searchLookup = React.useCallback(
    (targets: string[], term: string): Promise<LookupValue[]> =>
      dataverse.searchLookup(targets, term),
    [dataverse],
  );

  const resolveLookup = React.useCallback(
    (targets: string[], text: string): Promise<LookupValue[]> =>
      dataverse.resolveLookup(targets, text),
    [dataverse],
  );

  if (!entityName) {
    return React.createElement(
      FluentProvider,
      { theme, className: "jj-sheet-root" },
      <div className="jj-sheet-message">
        Bind this control to a view or subgrid to start editing.
      </div>,
    );
  }

  return (
    <FluentProvider theme={theme} className="jj-sheet-fluent">
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        version={CONTROL_VERSION}
        onCreate={onCreate}
        resolveLookup={resolveLookup}
        onSave={onSave}
        searchLookup={searchLookup}
      />
    </FluentProvider>
  );
};

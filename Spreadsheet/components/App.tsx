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

  // Apply the maker-configured page size to the dataset once (and on change), so
  // the host pages the query rather than the control trying to load everything.
  const desiredPageSize = (
    context.parameters as unknown as { pageSize?: { raw?: number } }
  ).pageSize?.raw;
  React.useEffect(() => {
    const ds = ctxRef.current.parameters.records as unknown as {
      paging?: { pageSize?: number; setPageSize?: (n: number) => void };
      refresh?: () => void;
    };
    if (
      ds.paging?.setPageSize &&
      typeof desiredPageSize === "number" &&
      desiredPageSize > 0 &&
      ds.paging.pageSize !== desiredPageSize
    ) {
      ds.paging.setPageSize(desiredPageSize);
      ds.refresh?.();
    }
  }, [desiredPageSize]);

  // Paging info and navigation for the footer.
  const pagingApi = (dataset as unknown as {
    paging?: {
      hasNextPage?: boolean;
      totalResultCount?: number;
      loadNextPage?: () => void;
    };
  }).paging;
  const paging = pagingApi
    ? {
        loaded: (dataset.sortedRecordIds ?? []).length,
        total:
          typeof pagingApi.totalResultCount === "number"
            ? pagingApi.totalResultCount
            : -1,
        hasMore: !!pagingApi.hasNextPage,
        onLoadMore: () => pagingApi.loadNextPage?.(),
      }
    : undefined;

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

  const onDelete = React.useCallback(
    async (recordId: string) => {
      await dataverse.deleteRecord(entityName, recordId);
      const refreshable = dataset as unknown as { refresh?: () => void };
      refreshable.refresh?.();
      onChange();
    },
    [dataverse, entityName, dataset, onChange],
  );

  const onOpenRecord = React.useCallback(
    (recordId: string) => dataverse.openRecord(entityName, recordId),
    [dataverse, entityName],
  );

  const onOpenLookup = React.useCallback(
    (lookupEntity: string, recordId: string) =>
      dataverse.openRecord(lookupEntity, recordId),
    [dataverse],
  );

  // Stable callback that reads the current dataset from the ref, so syncing the
  // selection to the host does not re-create the callback on every render.
  const onSelectionChange = React.useCallback((recordIds: string[]) => {
    const ds = ctxRef.current.parameters.records as unknown as {
      setSelectedRecordIds?: (ids: string[]) => void;
    };
    ds.setSelectedRecordIds?.(recordIds);
  }, []);

  // Current sort, read from the dataset so the header shows the right indicator.
  const sorting = (dataset as unknown as {
    sorting?: { name: string; sortDirection: number }[];
  }).sorting;
  const sortColumn = sorting && sorting.length > 0 ? sorting[0].name : null;
  const sortDescending = !!(sorting && sorting.length > 0 && sorting[0].sortDirection === 1);

  // Toggle the sort on a column. The host re-queries the dataset (server-side
  // sort), so it respects the view filter and works on large datasets.
  const onSort = React.useCallback((columnName: string) => {
    const ds = ctxRef.current.parameters.records as unknown as {
      sorting?: { name: string; sortDirection: number }[];
      refresh?: () => void;
    };
    const current = ds.sorting && ds.sorting[0];
    const descending = !!(
      current &&
      current.name === columnName &&
      current.sortDirection === 0
    );
    const next = { name: columnName, sortDirection: descending ? 1 : 0 };
    // Mutate the existing sorting array in place - reassigning the property is
    // not reliably honoured by the host. Fall back to assignment if needed.
    if (Array.isArray(ds.sorting)) {
      ds.sorting.length = 0;
      ds.sorting.push(next);
    } else {
      ds.sorting = [next];
    }
    ds.refresh?.();
  }, []);

  // Fill the host-provided container. When the host allocates a fixed height
  // (subgrids do) use it; otherwise fill the container at 100% (a main grid is
  // already height-bounded by the host). The min-height:0 flex chain in the CSS
  // is what lets the grid scroll inside itself and keep the header pinned.
  const allocatedHeight = (context.mode as unknown as { allocatedHeight?: number })
    .allocatedHeight;
  const shellStyle: React.CSSProperties =
    typeof allocatedHeight === "number" && allocatedHeight > 0
      ? { height: allocatedHeight }
      : {};

  if (!entityName) {
    return (
      <div className="jj-sheet-shell" style={shellStyle}>
        <FluentProvider theme={theme} className="jj-sheet-fluent">
          <div className="jj-sheet-message">
            Bind this control to a view or subgrid to start editing.
          </div>
        </FluentProvider>
      </div>
    );
  }

  return (
    <div className="jj-sheet-shell" style={shellStyle}>
      <FluentProvider theme={theme} className="jj-sheet-fluent">
        <SpreadsheetGrid
        columns={columns}
        rows={rows}
        version={CONTROL_VERSION}
        onCreate={onCreate}
        onDelete={onDelete}
        onOpenRecord={onOpenRecord}
        onOpenLookup={onOpenLookup}
        onSelectionChange={onSelectionChange}
        sortColumn={sortColumn}
        sortDescending={sortDescending}
        onSort={onSort}
        paging={paging}
        resolveLookup={resolveLookup}
        onSave={onSave}
        searchLookup={searchLookup}
      />
      </FluentProvider>
    </div>
  );
};

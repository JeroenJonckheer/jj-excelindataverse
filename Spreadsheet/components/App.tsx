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
import {
  DataverseService,
  type IDataverseService,
  type BatchOp,
  type RecordAccess,
  type FieldAccess,
} from "../services/DataverseService";
import { CONTROL_VERSION } from "../services/version";
import { SpreadsheetGrid } from "./SpreadsheetGrid";
import { ErrorBoundary } from "./ErrorBoundary";

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

  // The current user's table access. Read once from the server (reflects the
  // security role); fails open so a probe error never blocks editing.
  const firstRecordId = (dataset.sortedRecordIds ?? [])[0];
  const [access, setAccess] = React.useState<RecordAccess>({
    canWrite: true,
    canDelete: true,
    canCreate: true,
  });
  React.useEffect(() => {
    if (!entityName || !firstRecordId) return;
    let cancelled = false;
    dataverse
      .getAccess(entityName, firstRecordId)
      .then((a) => {
        if (!cancelled) setAccess(a);
        return null;
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [entityName, firstRecordId, dataverse]);

  // Field-Level Security: the user's read/update access for the secured columns.
  const securedKey = columns.filter((c) => c.secured).map((c) => c.name).join(",");
  const [fieldAccess, setFieldAccess] = React.useState<Record<string, FieldAccess>>({});
  React.useEffect(() => {
    if (!entityName || securedKey === "") {
      setFieldAccess({});
      return;
    }
    let cancelled = false;
    dataverse
      .getFieldAccess(entityName, securedKey.split(","))
      .then((fa) => {
        if (!cancelled) setFieldAccess(fa);
        return null;
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [entityName, securedKey, dataverse]);

  // A column is shown read-only when the role cannot write the table, or FLS
  // denies update on (or read of) a secured column.
  const effectiveColumns = React.useMemo(
    () =>
      columns.map((c) => {
        const fa = c.secured ? fieldAccess[c.name] : undefined;
        const flsBlocked = !!fa && (fa.update === false || fa.read === false);
        return !access.canWrite || flsBlocked ? { ...c, editable: false } : c;
      }),
    [columns, access.canWrite, fieldAccess],
  );

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
      reset?: () => void;
    };
  }).paging;
  const loadedCount = (dataset.sortedRecordIds ?? []).length;
  const totalCount =
    typeof pagingApi?.totalResultCount === "number"
      ? pagingApi.totalResultCount
      : -1;
  const paging = pagingApi
    ? {
        loaded: loadedCount,
        total: totalCount,
        hasMore: !!pagingApi.hasNextPage,
        onLoadMore: () => pagingApi.loadNextPage?.(),
      }
    : undefined;

  // Detect a stale loaded set: more rows loaded than the dataset says exist.
  // This happens when records are deleted outside the control (the command bar
  // Delete, a bulk delete, another user) - the host updates the total but keeps
  // handing us the rows it already loaded, so the grid would show ghost rows
  // until a manual page reload. Force one re-query from the first page; a guard
  // ref stops it from looping if the refresh does not change anything.
  const hasNextPage = !!pagingApi?.hasNextPage;
  // Remember that the grid has shown rows, so a sudden drop to zero can be told
  // apart from a genuinely empty view.
  const hadRowsRef = React.useRef(false);
  if (loadedCount > 0) hadRowsRef.current = true;
  const staleSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Two recoverable inconsistencies the host can leave us in; both are fixed
    // by re-querying from the first page, latched so a host that keeps returning
    // the same bad state cannot make us loop.
    //
    // A) Ghost rows: no next page, yet more rows loaded than reported to exist
    //    (records deleted outside the control). When there IS a next page,
    //    loaded > total is just the Dataverse 5000 count cap, not stale data.
    // B) Lost rows: zero rows handed back although records should be there (we
    //    had rows a moment ago, or the total is positive). This is the blank
    //    grid seen after adding a column on a large, paged view - the host
    //    re-queries and briefly returns nothing and does not recover on its own.
    const ghost = !hasNextPage && totalCount >= 0 && loadedCount > totalCount;
    const lostRows = loadedCount === 0 && (totalCount > 0 || hadRowsRef.current);
    if (ghost || lostRows) {
      const sig = `${loadedCount}:${totalCount}:${hasNextPage}:${hadRowsRef.current}`;
      if (staleSigRef.current !== sig) {
        staleSigRef.current = sig;
        pagingApi?.reset?.();
        (dataset as unknown as { refresh?: () => void }).refresh?.();
      }
    }
  }, [loadedCount, totalCount, hasNextPage, dataset, pagingApi]);

  const theme: Theme = React.useMemo(() => {
    const dark = !!(context as unknown as {
      fluentDesignLanguage?: { isDarkTheme?: boolean };
    }).fluentDesignLanguage?.isDarkTheme;
    return dark ? webDarkTheme : webLightTheme;
  }, [context]);

  // The per-record API calls no longer refresh the dataset themselves: a bulk
  // save (especially a bulk delete) would otherwise fire one refresh per record
  // in parallel, mid-operation, and the dataset would read back an intermediate
  // state (stale rows, a wrong "loaded of total" count). The grid calls
  // onCommitted once, after every save/create/delete has resolved.
  const onSave = React.useCallback(
    async (recordId: string, edits: PendingEdit[]) => {
      await dataverse.saveRecord(entityName, recordId, edits);
    },
    [dataverse, entityName],
  );

  const onCreate = React.useCallback(
    async (edits: PendingEdit[]) => {
      await dataverse.createRecord(entityName, edits);
    },
    [dataverse, entityName],
  );

  // Called once after a batch of saves/creates/deletes has fully resolved.
  const onCommitted = React.useCallback(() => {
    const refreshable = dataset as unknown as { refresh?: () => void };
    refreshable.refresh?.();
    onChange();
  }, [dataset, onChange]);

  // Bumped to remount the grid with fresh state after the error boundary's
  // Reload, so a crash caused by stale local state cannot immediately recur.
  const [reloadKey, setReloadKey] = React.useState(0);
  const onReload = React.useCallback(() => {
    setReloadKey((k) => k + 1);
    const refreshable = dataset as unknown as { refresh?: () => void };
    refreshable.refresh?.();
  }, [dataset]);

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
    },
    [dataverse, entityName],
  );

  // Commit a whole save (creates, updates, deletes) in one batched request.
  const onSaveBatch = React.useCallback(
    (ops: BatchOp[]) => dataverse.writeBatch(entityName, ops),
    [dataverse, entityName],
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
        <ErrorBoundary onReload={onReload}>
        <SpreadsheetGrid
        key={reloadKey}
        columns={effectiveColumns}
        rows={rows}
        version={CONTROL_VERSION}
        canDelete={access.canDelete}
        canCreate={access.canCreate}
        fieldAccess={fieldAccess}
        onCreate={onCreate}
        onDelete={onDelete}
        onSaveBatch={onSaveBatch}
        onCommitted={onCommitted}
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
        </ErrorBoundary>
      </FluentProvider>
    </div>
  );
};

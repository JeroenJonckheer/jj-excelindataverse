/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { IInputs } from "../generated/ManifestTypes";
import type { ColumnDef, LookupValue, PendingEdit, RequiredLevel } from "./types";
import { isLookupValue } from "./format";
import { serverErrorMessage } from "./errors";

/**
 * Whether an error looks transient (worth retrying): a throttle/server status
 * or a network/timeout/connection message. Deterministic outright failures
 * (validation, 400, 404) are not retried.
 */
export function isTransientError(err: unknown): boolean {
  if (err == null) return false;
  const status = (err as { status?: number; errorCode?: number }).status;
  if (typeof status === "number" && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  const msg = String((err as { message?: unknown }).message ?? err).toLowerCase();
  return /aborted|network|timeout|temporar|connection|econnreset|fetch failed|failed to fetch/.test(
    msg,
  );
}

/**
 * Contract used by the UI for all Dataverse access. Defining it as an interface
 * lets the React components be tested against a lightweight mock instead of a
 * live host context.
 */
export interface IDataverseService {
  /** Enriches the given columns with validation metadata from Dataverse. */
  enrichColumns(entityName: string, columns: ColumnDef[]): Promise<ColumnDef[]>;
  /** Searches the lookup target tables for records matching the term. */
  searchLookup(
    targets: string[],
    term: string,
    top?: number,
  ): Promise<LookupValue[]>;
  /**
   * Resolves pasted or typed text to existing records, matching on the primary
   * name (trimmed, case-insensitive) or on a GUID. Results are cached so a paste
   * of many rows with repeating values stays fast.
   */
  resolveLookup(targets: string[], text: string): Promise<LookupValue[]>;
  /** Saves the pending edits for a single record to Dataverse. */
  saveRecord(
    entityName: string,
    recordId: string,
    edits: PendingEdit[],
  ): Promise<void>;
  /** Creates a new record from the pending edits of a new row. */
  createRecord(entityName: string, edits: PendingEdit[]): Promise<void>;
  /** Deletes a record. */
  deleteRecord(entityName: string, recordId: string): Promise<void>;
  /**
   * Commits a batch of create/update/delete operations in one OData $batch
   * request (chunked), each operation in its own changeset so one failure does
   * not roll back the rest. Returns a per-operation result keyed by the row's
   * id. Far fewer round-trips than one request per record for a large paste or
   * bulk edit.
   */
  writeBatch(entityName: string, ops: BatchOp[]): Promise<BatchResult[]>;
  /**
   * The current user's access to the table, read from the server
   * (RetrievePrincipalAccess on a sample record, which reflects the user's
   * security role). Used to make the grid read-only / hide delete / block new
   * rows when the role does not allow it. Fails open (all allowed) so a lookup
   * error never wrongly blocks editing.
   */
  getAccess(entityName: string, sampleRecordId: string): Promise<RecordAccess>;
  /**
   * The current user's Field-Level-Security access for the given secured
   * columns, from the user's field security profiles. Returns a map per column
   * of { read, update }. Fails open (empty map = treat all as accessible) so a
   * query error never wrongly hides a field the user may see.
   */
  getFieldAccess(
    entityName: string,
    securedColumns: string[],
  ): Promise<Record<string, FieldAccess>>;
  /** Opens the standard form for a record in the host app. */
  openRecord(entityName: string, recordId: string): void;
  /**
   * Saves the current column layout and sort as a personal view (a Dataverse
   * userquery), so it appears for this user in the view selector.
   */
  savePersonalView(
    entityName: string,
    name: string,
    columns: ViewColumn[],
    sort: ViewSort[],
  ): Promise<void>;
}

/** The current user's table-level access (from the server). */
export interface RecordAccess {
  canWrite: boolean;
  canDelete: boolean;
  canCreate: boolean;
}

/** The current user's Field-Level-Security access for one secured column. */
export interface FieldAccess {
  read: boolean;
  update: boolean;
}

/** One create/update/delete to commit in a batch. */
export interface BatchOp {
  /** The row id this op belongs to (a temp id for a new row); used to map the
   * result back to the row. */
  recordId: string;
  kind: "create" | "update" | "delete";
  /** Pending edits for a create/update (ignored for delete). */
  edits?: PendingEdit[];
}

/** The outcome of a single batched operation. */
export interface BatchResult {
  recordId: string;
  ok: boolean;
  /** Server message when the operation failed. */
  error?: string;
}

interface EntityMeta {
  primaryNameAttribute: string;
  primaryIdAttribute: string;
  entitySetName: string;
  objectTypeCode: number;
}

/** A column to write into a personal view's layout. */
export interface ViewColumn {
  name: string;
  width: number;
}
/** A sort order to write into a personal view's query. */
export interface ViewSort {
  name: string;
  descending: boolean;
}

interface RelationshipMeta {
  navigationProperty: string;
  referencedEntity: string;
}

/**
 * A column is read-only when Dataverse says it cannot be updated. This covers
 * calculated and rollup fields (and any other server-computed column), so the
 * grid greys them out instead of letting the user edit something that would be
 * rejected or overwritten.
 */
function editableFromMeta(
  column: ColumnDef,
  meta: { IsValidForUpdate?: boolean } | null | undefined,
): boolean {
  return meta?.IsValidForUpdate === false ? false : column.editable;
}

/** Attribute metadata cast type names, by column kind. */
const CAST_STRING = "Microsoft.Dynamics.CRM.StringAttributeMetadata";
const CAST_PICKLIST = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata";
const CAST_BOOLEAN = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata";
const CAST_LOOKUP = "Microsoft.Dynamics.CRM.LookupAttributeMetadata";
const CAST_DATETIME = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata";

interface CastConfig {
  cast: string;
  select: string;
  expand?: string;
}

/** The metadata cast (and the fields to read) for a column, or null. */
function castForColumn(column: ColumnDef): CastConfig | null {
  switch (column.kind) {
    case "text":
    case "multiline":
      return { cast: CAST_STRING, select: "MaxLength,RequiredLevel,Format,IsValidForUpdate,IsSecured" };
    case "number":
      return {
        cast: numericMetadataType(column.dataType),
        select: "MinValue,MaxValue,Precision,RequiredLevel,IsValidForUpdate,IsSecured",
      };
    case "choice":
      return {
        cast: CAST_PICKLIST,
        select: "RequiredLevel,IsValidForUpdate,IsSecured,DefaultFormValue",
        expand: "OptionSet",
      };
    case "boolean":
      return {
        cast: CAST_BOOLEAN,
        select: "RequiredLevel,IsValidForUpdate,IsSecured,DefaultValue",
        expand: "OptionSet",
      };
    case "lookup":
      return { cast: CAST_LOOKUP, select: "Targets,RequiredLevel,IsValidForUpdate,IsSecured" };
    case "date":
    case "datetime":
      return { cast: CAST_DATETIME, select: "RequiredLevel,IsValidForUpdate,IsSecured" };
    default:
      return null;
  }
}

/** Applies one attribute's metadata to a column (no network access). */
function enrichFromMeta(column: ColumnDef, meta: any): ColumnDef {
  const base: ColumnDef = {
    ...column,
    editable: editableFromMeta(column, meta),
    required: mapRequiredLevel(meta?.RequiredLevel?.Value),
    secured: meta?.IsSecured === true ? true : column.secured,
  };
  switch (column.kind) {
    case "text":
    case "multiline":
      return {
        ...base,
        maxLength: typeof meta?.MaxLength === "number" ? meta.MaxLength : column.maxLength,
      };
    case "number":
      return {
        ...base,
        minValue: typeof meta?.MinValue === "number" ? meta.MinValue : undefined,
        maxValue: typeof meta?.MaxValue === "number" ? meta.MaxValue : undefined,
        precision:
          typeof meta?.Precision === "number"
            ? meta.Precision
            : column.dataType === "Whole.None"
              ? 0
              : undefined,
      };
    case "choice": {
      const options = (meta?.OptionSet?.Options ?? []).map((o: any) => ({
        value: o.Value,
        label: o.Label?.UserLocalizedLabel?.Label ?? String(o.Value),
      }));
      return {
        ...base,
        options,
        defaultValue:
          typeof meta?.DefaultFormValue === "number" && meta.DefaultFormValue >= 0
            ? meta.DefaultFormValue
            : undefined,
      };
    }
    case "boolean": {
      const os = meta?.OptionSet;
      return {
        ...base,
        options: [
          { value: 0, label: os?.FalseOption?.Label?.UserLocalizedLabel?.Label ?? "No" },
          { value: 1, label: os?.TrueOption?.Label?.UserLocalizedLabel?.Label ?? "Yes" },
        ],
        defaultValue: typeof meta?.DefaultValue === "boolean" ? meta.DefaultValue : undefined,
      };
    }
    case "lookup":
      return {
        ...base,
        lookupTargets: Array.isArray(meta?.Targets) ? meta.Targets : column.lookupTargets,
      };
    default:
      return base;
  }
}

/** Maps the Dataverse RequiredLevel value to our requirement level. */
function mapRequiredLevel(value: string | undefined): RequiredLevel {
  switch (value) {
    case "ApplicationRequired":
    case "SystemRequired":
      return "required";
    case "Recommended":
      return "recommended";
    default:
      return "none";
  }
}

/**
 * Thin wrapper around context.webAPI and the OData metadata endpoint. All
 * metadata reads are cached per control instance so repeated lookups stay
 * cheap.
 */
const GUID_PATTERN =
  /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

export class DataverseService implements IDataverseService {
  private entityMetaCache = new Map<string, EntityMeta>();
  private relationshipCache = new Map<string, RelationshipMeta>();
  private lookupResolveCache = new Map<string, LookupValue[]>();
  // Attribute metadata by `${entity}::${cast}` -> (logical name -> metadata).
  private attrMetaCache = new Map<string, Map<string, unknown>>();

  constructor(private ctx: ComponentFramework.Context<IInputs>) {}

  private get webApi(): ComponentFramework.WebApi {
    return this.ctx.webAPI;
  }

  /**
   * Retries an idempotent operation a few times on a transient error, with a
   * short backoff. Used for reads, updates and deletes - never for create, so a
   * lost response cannot duplicate a record.
   */
  private async withRetry<T>(op: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await op();
      } catch (e) {
        lastError = e;
        if (i === attempts - 1 || !isTransientError(e)) throw e;
        await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
      }
    }
    throw lastError;
  }

  /**
   * Enriches columns with attribute metadata. Instead of one request per column,
   * it makes at most one request per attribute type (cast) - so a 50-column view
   * loads in a handful of requests, not fifty. Results are cached per entity and
   * cast; a failed type is best-effort (those columns keep their defaults).
   */
  async enrichColumns(
    entityName: string,
    columns: ColumnDef[],
  ): Promise<ColumnDef[]> {
    const casts = new Map<string, CastConfig>();
    for (const column of columns) {
      if (!column.editable) continue;
      const cfg = castForColumn(column);
      if (cfg) casts.set(cfg.cast, cfg);
    }

    const maps = new Map<string, Map<string, unknown>>();
    await Promise.all(
      Array.from(casts.values()).map(async (cfg) => {
        maps.set(cfg.cast, await this.attributesByCast(entityName, cfg));
      }),
    );

    return columns.map((column) => {
      if (!column.editable) return column;
      const cfg = castForColumn(column);
      if (!cfg) return column;
      const meta = maps.get(cfg.cast)?.get(column.name);
      return meta ? enrichFromMeta(column, meta) : column;
    });
  }

  /** All attributes of one cast for an entity, indexed by logical name (cached). */
  private async attributesByCast(
    entityName: string,
    cfg: CastConfig,
  ): Promise<Map<string, unknown>> {
    const key = `${entityName}::${cfg.cast}`;
    const cached = this.attrMetaCache.get(key);
    if (cached) return cached;
    const map = new Map<string, unknown>();
    try {
      const expand = cfg.expand ? `&$expand=${cfg.expand}` : "";
      const result = await this.fetchOData(
        `EntityDefinitions(LogicalName='${entityName}')/Attributes/${cfg.cast}` +
          `?$select=LogicalName,${cfg.select}${expand}`,
      );
      for (const a of (result?.value ?? []) as { LogicalName?: string }[]) {
        if (a?.LogicalName) map.set(a.LogicalName, a);
      }
    } catch (e) {
      // Best effort: columns of this type keep their type-based defaults.
      console.warn(
        `JJ - Excel in Dataverse: could not read ${cfg.cast} metadata for '${entityName}'.`,
        e,
      );
    }
    this.attrMetaCache.set(key, map);
    return map;
  }

  async searchLookup(
    targets: string[],
    term: string,
    top = 10,
  ): Promise<LookupValue[]> {
    const results: LookupValue[] = [];
    for (const target of targets) {
      try {
        const meta = await this.getEntityMeta(target);
        const name = meta.primaryNameAttribute;
        const id = meta.primaryIdAttribute;
        const cond = lookupNameFilter(name, term);
        const filter = cond ? `&$filter=${cond}` : "";
        const query = `?$select=${id},${name}&$top=${top}${filter}&$orderby=${name}`;
        const list = await this.webApi.retrieveMultipleRecords(target, query);
        for (const e of list.entities) {
          results.push({
            id: e[id],
            name: e[name] ?? "(unnamed)",
            entityType: target,
          });
        }
      } catch (e) {
        console.warn(
          `JJ - Excel in Dataverse: lookup search failed for table '${target}'.`,
          e,
        );
      }
    }
    return results;
  }

  async resolveLookup(targets: string[], text: string): Promise<LookupValue[]> {
    // Collapse all whitespace - including newlines and tabs that a copied cell
    // can carry - to single spaces. A record name is single line, and a stray
    // line break in the pasted value would otherwise break the query.
    const term = text.replace(/\s+/g, " ").trim();
    if (term.length === 0) return [];
    const cacheKey = `${targets.join(",")}::${term.toLowerCase()}`;
    const cached = this.lookupResolveCache.get(cacheKey);
    if (cached) return cached;

    const isGuid = GUID_PATTERN.test(term);
    const id = term.replace(/[{}]/g, "");
    const results: LookupValue[] = [];
    let errored = false;

    for (const target of targets) {
      try {
        const meta = await this.getEntityMeta(target);
        if (isGuid) {
          const rec = await this.webApi.retrieveRecord(
            target,
            id,
            `?$select=${meta.primaryNameAttribute}`,
          );
          results.push({
            id,
            name: rec[meta.primaryNameAttribute] ?? "(unnamed)",
            entityType: target,
          });
        } else {
          // Search with contains, then keep only normalised exact matches. This
          // is more forgiving than an exact "eq" filter about casing and stray
          // whitespace, so a pasted value resolves the same way the type-ahead
          // picker would.
          const wanted = normalizeName(term);
          const list = await this.webApi.retrieveMultipleRecords(
            target,
            `?$select=${meta.primaryIdAttribute},${meta.primaryNameAttribute}` +
              `&$filter=contains(${meta.primaryNameAttribute},'${escapeODataString(term)}')&$top=50`,
          );
          for (const e of list.entities) {
            const name = e[meta.primaryNameAttribute] ?? "";
            if (normalizeName(name) === wanted) {
              results.push({
                id: e[meta.primaryIdAttribute],
                name: name || "(unnamed)",
                entityType: target,
              });
            }
          }
        }
      } catch (e) {
        // A missing record by id, or a query failure, simply yields no match
        // for this target. A query failure (throttle, transient) must not be
        // cached as "no match", or the value would never resolve afterwards.
        errored = true;
        console.warn(
          `JJ - Excel in Dataverse: could not resolve lookup '${term}' on table '${target}'.`,
          e,
        );
      }
    }

    // Only cache a definitive result. If a target errored and produced nothing,
    // leave it uncached so a later retry can resolve it.
    if (!errored || results.length > 0) {
      this.lookupResolveCache.set(cacheKey, results);
    }
    return results;
  }

  async saveRecord(
    entityName: string,
    recordId: string,
    edits: PendingEdit[],
  ): Promise<void> {
    const payload = await this.buildPayload(entityName, edits);
    await this.withRetry(() =>
      this.webApi.updateRecord(entityName, recordId, payload),
    );
  }

  async createRecord(entityName: string, edits: PendingEdit[]): Promise<void> {
    const payload = await this.buildPayload(entityName, edits);
    await this.webApi.createRecord(entityName, payload);
  }

  async deleteRecord(entityName: string, recordId: string): Promise<void> {
    await this.withRetry(() => this.webApi.deleteRecord(entityName, recordId));
  }

  private currentUserId: string | null = null;
  private accessCache = new Map<string, RecordAccess>();

  private async whoAmI(): Promise<string> {
    if (this.currentUserId) return this.currentUserId;
    const r = await this.fetchOData("WhoAmI()");
    this.currentUserId = String(r?.UserId ?? "");
    return this.currentUserId;
  }

  async getAccess(entityName: string, sampleRecordId: string): Promise<RecordAccess> {
    const allowed: RecordAccess = { canWrite: true, canDelete: true, canCreate: true };
    const cached = this.accessCache.get(entityName);
    if (cached) return cached;
    try {
      const meta = await this.getEntityMeta(entityName);
      const me = await this.whoAmI();
      if (!me) return allowed;
      const param = encodeURIComponent(JSON.stringify({ "@odata.id": `systemusers(${me})` }));
      const res = await this.fetchOData(
        `${meta.entitySetName}(${sampleRecordId})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@p)?@p=${param}`,
      );
      const rights = String(res?.AccessRights ?? "");
      const access: RecordAccess = {
        canWrite: rights.includes("WriteAccess"),
        canDelete: rights.includes("DeleteAccess"),
        canCreate: rights.includes("CreateAccess"),
      };
      this.accessCache.set(entityName, access);
      return access;
    } catch (e) {
      // Fail open: never block editing because an access probe failed.
      console.warn(
        "JJ - Excel in Dataverse: could not read table access; allowing edits.",
        e,
      );
      return allowed;
    }
  }

  private fieldAccessCache = new Map<string, Record<string, FieldAccess>>();

  async getFieldAccess(
    entityName: string,
    securedColumns: string[],
  ): Promise<Record<string, FieldAccess>> {
    if (securedColumns.length === 0) return {};
    const cached = this.fieldAccessCache.get(entityName);
    if (cached) return cached;
    try {
      const me = await this.whoAmI();
      if (!me) return {};
      // The field security profiles assigned directly to the user. (Team-assigned
      // profiles are not yet considered; those columns simply stay accessible -
      // fail-open - until that path is added.)
      const profilesRes = await this.fetchOData(
        `systemusers(${me})/systemuserprofiles_association?$select=fieldsecurityprofileid`,
      );
      const profileIds = new Set<string>(
        ((profilesRes?.value ?? []) as { fieldsecurityprofileid?: string }[])
          .map((p) => p.fieldsecurityprofileid)
          .filter((id): id is string => typeof id === "string"),
      );
      // The field permissions for this table; keep the ones in the user's profiles.
      const permsRes = await this.fetchOData(
        `fieldpermissions?$select=attributelogicalname,canread,canupdate,_fieldsecurityprofileid_value` +
          `&$filter=entityname eq '${escapeODataString(entityName)}'`,
      );
      const granted = new Map<string, FieldAccess>();
      for (const p of (permsRes?.value ?? []) as {
        attributelogicalname?: string;
        canread?: number;
        canupdate?: number;
        _fieldsecurityprofileid_value?: string;
      }[]) {
        if (!p.attributelogicalname) continue;
        if (profileIds.size > 0 && !profileIds.has(p._fieldsecurityprofileid_value ?? "")) {
          continue;
        }
        const prev = granted.get(p.attributelogicalname) ?? { read: false, update: false };
        // The canread/canupdate option set uses 4 for "Allowed".
        granted.set(p.attributelogicalname, {
          read: prev.read || p.canread === 4,
          update: prev.update || p.canupdate === 4,
        });
      }
      const result: Record<string, FieldAccess> = {};
      for (const col of securedColumns) {
        // A secured column with no granting permission row means no access.
        result[col] = granted.get(col) ?? { read: false, update: false };
      }
      this.fieldAccessCache.set(entityName, result);
      return result;
    } catch (e) {
      // Fail open: never hide a field because the FLS query failed.
      console.warn(
        "JJ - Excel in Dataverse: could not read field security; not masking.",
        e,
      );
      return {};
    }
  }

  async writeBatch(entityName: string, ops: BatchOp[]): Promise<BatchResult[]> {
    if (ops.length === 0) return [];
    const meta = await this.getEntityMeta(entityName);
    const eset = meta.entitySetName;
    const base = `${this.clientUrl()}/api/data/v9.2`;

    // Build each sub-request up front (payloads need async metadata).
    const prepared = await Promise.all(
      ops.map(async (op) => {
        if (op.kind === "delete") {
          return { op, method: "DELETE", url: `${base}/${eset}(${op.recordId})`, body: null as string | null };
        }
        const payload = await this.buildPayload(entityName, op.edits ?? []);
        const body = JSON.stringify(payload);
        return op.kind === "create"
          ? { op, method: "POST", url: `${base}/${eset}`, body }
          : { op, method: "PATCH", url: `${base}/${eset}(${op.recordId})`, body };
      }),
    );

    // One $batch HTTP request per chunk; never auto-retried (a lost response on
    // a create could otherwise duplicate a record).
    const CHUNK = 100;
    const results: BatchResult[] = [];
    for (let i = 0; i < prepared.length; i += CHUNK) {
      results.push(...(await this.postBatch(base, prepared.slice(i, i + CHUNK))));
    }
    return results;
  }

  /** Posts one multipart/mixed $batch (each op in its own changeset) and maps
   * the ordered sub-responses back to the operations. */
  private async postBatch(
    base: string,
    items: { op: BatchOp; method: string; url: string; body: string | null }[],
  ): Promise<BatchResult[]> {
    const boundary = `batch_jj_${Date.now()}_${batchCounter++}`;
    const segments = items.map((it, k) => {
      const cs = `changeset_jj_${k}`;
      const head =
        `--${boundary}\r\nContent-Type: multipart/mixed; boundary=${cs}\r\n\r\n` +
        `--${cs}\r\nContent-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\nContent-ID: ${k + 1}\r\n\r\n` +
        `${it.method} ${it.url} HTTP/1.1\r\n`;
      const payload =
        it.body != null
          ? `Content-Type: application/json;type=entry\r\n\r\n${it.body}\r\n`
          : `\r\n`;
      return `${head}${payload}--${cs}--\r\n`;
    });
    const body = `${segments.join("")}--${boundary}--\r\n`;

    try {
      const resp = await fetch(`${base}/$batch`, {
        method: "POST",
        headers: {
          "OData-Version": "4.0",
          "OData-MaxVersion": "4.0",
          Accept: "application/json",
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
        },
        credentials: "include",
        body,
      });
      const text = await resp.text();
      if (!resp.ok && !text.includes("HTTP/1.1")) {
        // The whole batch was rejected (e.g. auth) - fail every op so the grid
        // keeps them pending.
        return items.map((it) => ({
          recordId: it.op.recordId,
          ok: false,
          error: `Batch ${resp.status}: ${text.slice(0, 200)}`,
        }));
      }
      return mapBatchResponse(text, items.map((it) => it.op));
    } catch (e) {
      return items.map((it) => ({
        recordId: it.op.recordId,
        ok: false,
        error: serverErrorMessage(e),
      }));
    }
  }

  private clientUrl(): string {
    return (
      (this.ctx as any).page?.getClientUrl?.() ??
      (window as any).Xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.() ??
      ""
    );
  }

  openRecord(entityName: string, recordId: string): void {
    const opts = { entityName, entityId: recordId };
    const nav = (this.ctx as unknown as { navigation?: { openForm?: (o: unknown) => void } })
      .navigation;
    if (nav?.openForm) {
      try {
        nav.openForm(opts);
        return;
      } catch (e) {
        console.warn("JJ - Excel in Dataverse: navigation.openForm failed.", e);
      }
    }
    const xrm = (window as unknown as { Xrm?: { Navigation?: { openForm?: (o: unknown) => void } } }).Xrm;
    if (xrm?.Navigation?.openForm) {
      xrm.Navigation.openForm(opts);
    }
  }

  async savePersonalView(
    entityName: string,
    name: string,
    columns: ViewColumn[],
    sort: ViewSort[],
  ): Promise<void> {
    const meta = await this.getEntityMeta(entityName);
    const attributes = columns.map((c) => `<attribute name="${c.name}" />`).join("");
    const orders = sort
      .map((s) => `<order attribute="${s.name}" descending="${s.descending}" />`)
      .join("");
    const fetchxml =
      `<fetch version="1.0" mapping="logical" returntotalrecordcount="true">` +
      `<entity name="${entityName}">${attributes}${orders}</entity></fetch>`;
    const cells = columns
      .map((c) => `<cell name="${c.name}" width="${Math.round(c.width)}" />`)
      .join("");
    const layoutxml =
      `<grid name="resultset" object="${meta.objectTypeCode}" jump="${meta.primaryNameAttribute}" ` +
      `select="1" icon="1" preview="1"><row name="result" id="${meta.primaryIdAttribute}">` +
      `${cells}</row></grid>`;
    await this.webApi.createRecord("userquery", {
      name,
      returnedtypecode: entityName,
      fetchxml,
      layoutxml,
      querytype: 0,
    });
  }

  private async buildPayload(
    entityName: string,
    edits: PendingEdit[],
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    for (const edit of edits) {
      await this.applyEditToPayload(entityName, payload, edit);
    }
    return payload;
  }

  private async applyEditToPayload(
    entityName: string,
    payload: Record<string, unknown>,
    edit: PendingEdit,
  ): Promise<void> {
    const value = edit.value;

    if (edit.kind === "lookup") {
      const rel = await this.getRelationship(entityName, edit.columnName);
      const navProp = rel.navigationProperty;
      if (!isLookupValue(value)) {
        payload[`${navProp}@odata.bind`] = null;
        return;
      }
      const targetMeta = await this.getEntityMeta(value.entityType);
      payload[`${navProp}@odata.bind`] =
        `/${targetMeta.entitySetName}(${value.id})`;
      return;
    }

    if (value instanceof Date) {
      payload[edit.columnName] = value.toISOString();
      return;
    }

    payload[edit.columnName] = value;
  }

  private async getEntityMeta(entityName: string): Promise<EntityMeta> {
    const cached = this.entityMetaCache.get(entityName);
    if (cached) return cached;
    const result = await this.fetchOData(
      `EntityDefinitions(LogicalName='${entityName}')?$select=PrimaryNameAttribute,PrimaryIdAttribute,EntitySetName,ObjectTypeCode`,
    );
    const meta: EntityMeta = {
      primaryNameAttribute: result.PrimaryNameAttribute,
      primaryIdAttribute: result.PrimaryIdAttribute,
      entitySetName: result.EntitySetName,
      objectTypeCode: result.ObjectTypeCode,
    };
    this.entityMetaCache.set(entityName, meta);
    return meta;
  }

  private async getRelationship(
    entityName: string,
    columnName: string,
  ): Promise<RelationshipMeta> {
    const key = `${entityName}:${columnName}`;
    const cached = this.relationshipCache.get(key);
    if (cached) return cached;
    const result = await this.fetchOData(
      `EntityDefinitions(LogicalName='${entityName}')/ManyToOneRelationships` +
        `?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity` +
        `&$filter=ReferencingAttribute eq '${columnName}'`,
    );
    const rel = result?.value?.[0];
    const meta: RelationshipMeta = {
      navigationProperty: rel?.ReferencingEntityNavigationPropertyName ?? columnName,
      referencedEntity: rel?.ReferencedEntity ?? "",
    };
    this.relationshipCache.set(key, meta);
    return meta;
  }

  /** Generic OData GET against the org Web API root, used for metadata reads. */
  private async fetchOData(relative: string): Promise<any> {
    const clientUrl =
      (this.ctx as any).page?.getClientUrl?.() ??
      (window as any).Xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.();
    const url = `${clientUrl}/api/data/v9.2/${relative}`;
    return this.withRetry(async () => {
      const resp = await fetch(url, {
        headers: {
          "OData-Version": "4.0",
          "OData-MaxVersion": "4.0",
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
        },
        credentials: "include",
      });
      if (!resp.ok) {
        const err = new Error(`OData ${resp.status}: ${await resp.text()}`) as Error & {
          status?: number;
        };
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    });
  }
}

/** Monotonic suffix so concurrent $batch boundaries never collide. */
let batchCounter = 0;

/**
 * Maps an OData $batch response body to a per-operation result. Each changeset
 * yields one `HTTP/1.1 <status>` line, in request order; a 2xx is a success,
 * anything else carries the server's error message from the JSON body.
 */
export function mapBatchResponse(text: string, ops: BatchOp[]): BatchResult[] {
  // Each changeset sub-response is an `application/http` part whose FIRST line is
  // the real `HTTP/1.1 <status>`. Anchor on those part headers, so a status-like
  // string echoed inside an error body cannot shift the mapping and clear a
  // failed row's draft (or keep a saved row dirty).
  const parts = text.split(/content-type:\s*application\/http/i).slice(1);
  return ops.map((op, k) => {
    const part = parts[k];
    if (part === undefined) {
      return { recordId: op.recordId, ok: false, error: "No response for this operation." };
    }
    const m = /HTTP\/1\.1\s+(\d{3})/.exec(part);
    if (!m) {
      return { recordId: op.recordId, ok: false, error: "No response for this operation." };
    }
    const code = Number(m[1]);
    if (code >= 200 && code < 300) return { recordId: op.recordId, ok: true };
    return {
      recordId: op.recordId,
      ok: false,
      error: extractErrorMessage(part) ?? `Save failed (HTTP ${code}).`,
    };
  });
}

/** Pulls the `"message"` out of an OData error JSON body within a segment. */
function extractErrorMessage(segment: string): string | null {
  const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(segment);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

/** Returns the metadata cast type used for a numeric column. */
function numericMetadataType(dataType: string): string {
  switch (dataType) {
    case "Whole.None":
      return "Microsoft.Dynamics.CRM.IntegerAttributeMetadata";
    case "Decimal":
      return "Microsoft.Dynamics.CRM.DecimalAttributeMetadata";
    case "Currency":
      return "Microsoft.Dynamics.CRM.MoneyAttributeMetadata";
    case "FP":
    default:
      return "Microsoft.Dynamics.CRM.DoubleAttributeMetadata";
  }
}

/** Escapes a single quote for safe inclusion in an OData string literal. */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Builds the OData filter for a lookup search the way Dataverse does it: a plain
 * term matches records whose name STARTS WITH it; a `*` wildcard switches to
 * "contains" (e.g. `*al` finds "al" anywhere in the name). Returns "" when there
 * is nothing to filter on (browse the top records).
 */
export function lookupNameFilter(nameAttr: string, rawTerm: string): string {
  const wildcard = rawTerm.trimStart().startsWith("*");
  const inner = rawTerm.replace(/\*/g, "").trim();
  if (inner.length === 0) return "";
  const esc = escapeODataString(inner);
  return wildcard
    ? `contains(${nameAttr},'${esc}')`
    : `startswith(${nameAttr},'${esc}')`;
}

/** Normalises a name for lenient matching: trim, collapse whitespace, lowercase. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import type { IInputs } from "../generated/ManifestTypes";
import type { ColumnDef, LookupValue, PendingEdit, RequiredLevel } from "./types";
import { isLookupValue } from "./format";

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
  /** Saves the pending edits for a single record to Dataverse. */
  saveRecord(
    entityName: string,
    recordId: string,
    edits: PendingEdit[],
  ): Promise<void>;
}

interface EntityMeta {
  primaryNameAttribute: string;
  primaryIdAttribute: string;
  entitySetName: string;
}

interface RelationshipMeta {
  navigationProperty: string;
  referencedEntity: string;
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
export class DataverseService implements IDataverseService {
  private entityMetaCache = new Map<string, EntityMeta>();
  private relationshipCache = new Map<string, RelationshipMeta>();

  constructor(private ctx: ComponentFramework.Context<IInputs>) {}

  private get webApi(): ComponentFramework.WebApi {
    return this.ctx.webAPI;
  }

  async enrichColumns(
    entityName: string,
    columns: ColumnDef[],
  ): Promise<ColumnDef[]> {
    const enriched: ColumnDef[] = [];
    for (const column of columns) {
      try {
        enriched.push(await this.enrichColumn(entityName, column));
      } catch (e) {
        // Metadata enrichment is best effort. If it fails the column keeps its
        // type-based defaults and inline validation still applies basic checks.
        console.warn(
          `Dataverse Spreadsheet: could not read metadata for column '${column.name}'.`,
          e,
        );
        enriched.push(column);
      }
    }
    return enriched;
  }

  private async enrichColumn(
    entityName: string,
    column: ColumnDef,
  ): Promise<ColumnDef> {
    if (!column.editable) return column;
    const base = `EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${column.name}')`;

    switch (column.kind) {
      case "text":
      case "multiline": {
        const meta = await this.fetchOData(
          `${base}/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MaxLength,RequiredLevel,Format`,
        );
        return {
          ...column,
          required: mapRequiredLevel(meta?.RequiredLevel?.Value),
          maxLength:
            typeof meta?.MaxLength === "number" ? meta.MaxLength : column.maxLength,
        };
      }
      case "number": {
        const typeName = numericMetadataType(column.dataType);
        const meta = await this.fetchOData(
          `${base}/${typeName}?$select=MinValue,MaxValue,Precision,RequiredLevel`,
        );
        return {
          ...column,
          required: mapRequiredLevel(meta?.RequiredLevel?.Value),
          minValue: typeof meta?.MinValue === "number" ? meta.MinValue : undefined,
          maxValue: typeof meta?.MaxValue === "number" ? meta.MaxValue : undefined,
          precision:
            typeof meta?.Precision === "number"
              ? meta.Precision
              : column.dataType === "Whole.None"
                ? 0
                : undefined,
        };
      }
      case "choice": {
        const meta = await this.fetchOData(
          `${base}/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=RequiredLevel&$expand=OptionSet`,
        );
        const options = (meta?.OptionSet?.Options ?? []).map((o: any) => ({
          value: o.Value,
          label: o.Label?.UserLocalizedLabel?.Label ?? String(o.Value),
        }));
        return {
          ...column,
          required: mapRequiredLevel(meta?.RequiredLevel?.Value),
          options,
        };
      }
      case "boolean": {
        const meta = await this.fetchOData(
          `${base}/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=RequiredLevel&$expand=OptionSet`,
        );
        const os = meta?.OptionSet;
        const options = [
          { value: 0, label: os?.FalseOption?.Label?.UserLocalizedLabel?.Label ?? "No" },
          { value: 1, label: os?.TrueOption?.Label?.UserLocalizedLabel?.Label ?? "Yes" },
        ];
        return {
          ...column,
          required: mapRequiredLevel(meta?.RequiredLevel?.Value),
          options,
        };
      }
      case "lookup": {
        const meta = await this.fetchOData(
          `${base}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,RequiredLevel`,
        );
        return {
          ...column,
          required: mapRequiredLevel(meta?.RequiredLevel?.Value),
          lookupTargets: Array.isArray(meta?.Targets) ? meta.Targets : column.lookupTargets,
        };
      }
      case "date":
      case "datetime": {
        const meta = await this.fetchOData(
          `${base}/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=RequiredLevel`,
        );
        return { ...column, required: mapRequiredLevel(meta?.RequiredLevel?.Value) };
      }
      default:
        return column;
    }
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
        const filter =
          term.trim().length > 0
            ? `&$filter=contains(${name},'${escapeODataString(term)}')`
            : "";
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
          `Dataverse Spreadsheet: lookup search failed for table '${target}'.`,
          e,
        );
      }
    }
    return results;
  }

  async saveRecord(
    entityName: string,
    recordId: string,
    edits: PendingEdit[],
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    for (const edit of edits) {
      await this.applyEditToPayload(entityName, payload, edit);
    }
    await this.webApi.updateRecord(entityName, recordId, payload);
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
      `EntityDefinitions(LogicalName='${entityName}')?$select=PrimaryNameAttribute,PrimaryIdAttribute,EntitySetName`,
    );
    const meta: EntityMeta = {
      primaryNameAttribute: result.PrimaryNameAttribute,
      primaryIdAttribute: result.PrimaryIdAttribute,
      entitySetName: result.EntitySetName,
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
      throw new Error(`OData ${resp.status}: ${await resp.text()}`);
    }
    return resp.json();
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

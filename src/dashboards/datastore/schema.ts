/**
 * Schema inference for Base Dashboards (pure — no `obsidian`).
 *
 * The data type of a field is decided across every row: a field whose non-empty cells all share
 * one kind takes that kind; a field with mixed non-empty kinds, or with no non-empty cells at all,
 * is `unknown`. Empty cells (`kind: null`) never decide a type.
 */
import { AdaptedEntry, FieldDescriptor, FieldType, Schema, SchemaField } from "./types";

/** Reduce the kinds seen in a column to a single `FieldType`. */
export function inferFieldType(kinds: (FieldType | null)[]): FieldType {
    const seen = new Set<FieldType>();
    for (const kind of kinds) {
        if (kind !== null) seen.add(kind);
    }
    if (seen.size === 1) {
        const [only] = seen;
        return only;
    }
    // No evidence, or conflicting evidence → unknown.
    return "unknown";
}

/** Infer the schema for the given visible properties across all adapted entries. */
export function inferSchema(entries: AdaptedEntry[], properties: FieldDescriptor[]): Schema {
    const fields: SchemaField[] = properties.map((prop) => {
        const kinds = entries.map((entry) => entry.cells[prop.id]?.kind ?? null);
        return { id: prop.id, name: prop.name, type: inferFieldType(kinds) };
    });
    const byId: Record<string, SchemaField> = {};
    for (const field of fields) byId[field.id] = field;
    return { fields, byId };
}

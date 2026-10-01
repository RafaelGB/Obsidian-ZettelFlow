/**
 * Base Dashboards — the pure, Obsidian-free data vocabulary (epic #622, S1 #623).
 *
 * Nothing in `dashboards/datastore` may import `obsidian`: the typed `Value` lattice is mapped to
 * these plain structures at the boundary (`dashboards/base/adaptEntry.ts`, the only `instanceof
 * Value` site), so this core stays jest-testable and renderer-/theme-agnostic. The boundary is
 * enforced by `test/dashboards/datastore/pure-is-obsidian-free.test.ts`.
 */

/** The data type a field carries, inferred from the Bases `Value` lattice at the boundary. */
export type FieldType = "date" | "number" | "category" | "boolean" | "link" | "unknown";

/**
 * A single value in an adapted row — a plain projection of one Obsidian `Value`.
 * `kind` is `null` when the value is absent / empty (`NullValue`), so inference can ignore it.
 */
export interface TaggedCell {
    kind: FieldType | null;
    /** Human-readable form (Obsidian's `Value.toString()` at the boundary). */
    display: string;
    /** The primitive extracted for computation. */
    raw: number | string | boolean | null;
}

/** A visible Base property, named (the display name is resolved at the boundary). */
export interface FieldDescriptor {
    /** Namespaced Bases property id (`note.x` / `formula.x` / `file.x`). */
    id: string;
    /** Friendly display name (from `BasesViewConfig.getDisplayName`). */
    name: string;
}

/** One Base entry, adapted to plain cells keyed by the (namespaced) property id. */
export interface AdaptedEntry {
    /** The note's vault path — identity for the derived signature (never a cached `TFile`). */
    path: string;
    /** Property id → its adapted cell. */
    cells: Record<string, TaggedCell>;
}

/** One field in the inferred schema. */
export interface SchemaField {
    id: string;
    name: string;
    type: FieldType;
}

/** The inferred schema: ordered visible fields + a lookup by property id. */
export interface Schema {
    /** Visible fields, in the user's configured order. */
    fields: SchemaField[];
    byId: Record<string, SchemaField>;
}

/** A display-ready row: property id → the cell. */
export type Row = Record<string, TaggedCell>;

/**
 * An in-memory derived field. It is evaluated only while a panel is processed and is **never
 * written back to the vault** (constitution §XII); it lives on the snapshot, not on a note.
 */
export interface DerivedField {
    id: string;
    name: string;
    type: FieldType;
    compute: (row: Row) => TaggedCell;
}

/** The normalized, cached projection every panel reads. */
export interface DataStoreSnapshot {
    schema: Schema;
    rows: Row[];
    /** By property id → value `display` → the indices of rows carrying it (grouping/lookup). */
    indexes: Record<string, Record<string, number[]>>;
    rowCount: number;
    /** The derived signature this snapshot was built from (identity-keyed memo). */
    signature: string;
}

/**
 * The pure core of **computed fields** (epic #632) — the dashboard-level successor to S6's per-panel
 * script transformer. A script is a `rows => rows` (now **async**) over plain value rows
 * (`{ fieldId: value }`). It is given **only** the rows plus a read-only, offline `zf` (closed over by
 * the injected `run`, never imported here) — no `app`, no `TaggedCell` internals — so this module
 * stays Obsidian-free and jest-testable (`pure-is-obsidian-free.test.ts`). The boundary that compiles
 * the function and binds `zf` is `dashboards/base/scriptTransform.ts`.
 */
import { inferFieldType } from "dashboards/datastore";
import type { DataStoreSnapshot, FieldType, Row, SchemaField, TaggedCell } from "dashboards/datastore";

export type PlainRow = Record<string, number | string | boolean | null>;
export type ScriptRun = (rows: PlainRow[]) => unknown;
export type ComputedResult =
    | { ok: true; fields: SchemaField[]; rows: Row[] }
    | { ok: false; error: string };

export function toPlainRows(rows: Row[]): PlainRow[] {
    return rows.map((row) => {
        const plain: PlainRow = {};
        for (const [id, cell] of Object.entries(row)) plain[id] = cell.raw;
        return plain;
    });
}

const FIELD_TYPES: ReadonlySet<string> = new Set(["date", "number", "category", "boolean", "link", "unknown"]);

/**
 * A script may **declare** a cell's type instead of leaving it to inference, by returning
 * `{ value, type }` for that field (#632) — e.g. `{ value: "2026-01-01", type: "date" }` so a
 * string-shaped date charts as a date. A plain value still infers its type.
 */
function isTypedCell(value: unknown): value is { value: unknown; type: FieldType } {
    if (typeof value !== "object" || value === null) return false;
    if (!("value" in value) || !("type" in value)) return false;
    const type = (value as { type: unknown }).type;
    return typeof type === "string" && FIELD_TYPES.has(type);
}

/** Defensive string form of any value, without tripping `no-base-to-string` on an object. */
function display(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return typeof value === "object" && value !== null ? (JSON.stringify(value) ?? "") : "";
    } catch {
        return "";
    }
}

function tagTyped(value: unknown, type: FieldType): TaggedCell {
    if (value === null || value === undefined) return { kind: type, display: "", raw: null };
    if (type === "number") {
        const n = Number(value);
        return { kind: "number", display: display(value), raw: Number.isNaN(n) ? null : n };
    }
    if (type === "boolean") return { kind: "boolean", display: display(value), raw: Boolean(value) };
    return { kind: type, display: display(value), raw: display(value) };
}

function tag(value: unknown): TaggedCell {
    if (isTypedCell(value)) return tagTyped(value.value, value.type);
    if (value === null || value === undefined) return { kind: null, display: "", raw: null };
    if (typeof value === "number") return { kind: "number", display: String(value), raw: value };
    if (typeof value === "boolean") return { kind: "boolean", display: String(value), raw: value };
    if (typeof value === "string") return { kind: "category", display: value, raw: value };
    return { kind: "category", display: display(value), raw: display(value) };
}

export function fromPlainRows(plain: Record<string, unknown>[]): { fields: SchemaField[]; rows: Row[] } {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of plain) {
        for (const id of Object.keys(row)) {
            if (!seen.has(id)) {
                seen.add(id);
                ids.push(id);
            }
        }
    }
    const rows: Row[] = plain.map((row) => {
        const out: Row = {};
        for (const id of ids) out[id] = tag(row[id]);
        return out;
    });
    const fields: SchemaField[] = ids.map((id) => ({
        id,
        name: id,
        type: inferFieldType(rows.map((row) => row[id]?.kind ?? null)),
    }));
    return { fields, rows };
}

/**
 * Run a computed-field script over a snapshot's rows and **merge any NEW columns** onto its schema,
 * fail-safe. The common case is column-adding (`rows => rows.map(r => ({ ...r, score }))`): base cells
 * and their inferred types are preserved, only the new columns are appended. If the script changes the
 * row count (a reshape), its output is taken wholesale. Never mutates the input rows.
 */
export async function runComputed(
    base: Pick<DataStoreSnapshot, "schema" | "rows">,
    run: ScriptRun,
): Promise<ComputedResult> {
    let result: unknown;
    try {
        result = await run(toPlainRows(base.rows));
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (!Array.isArray(result)) {
        return { ok: false, error: "A computed-field script must return an array of rows" };
    }
    const plain = result.filter((row): row is PlainRow => Boolean(row) && typeof row === "object");
    const built = fromPlainRows(plain);
    const baseIds = new Set(base.schema.fields.map((field) => field.id));
    const newFields = built.fields.filter((field) => !baseIds.has(field.id));

    if (built.rows.length === base.rows.length) {
        const rows: Row[] = base.rows.map((baseRow, index) => {
            const merged: Row = { ...baseRow };
            for (const field of newFields) merged[field.id] = built.rows[index][field.id];
            return merged;
        });
        return { ok: true, fields: [...base.schema.fields, ...newFields], rows };
    }
    // The script reshaped the rows (count changed) — take what it returned.
    return { ok: true, fields: built.fields, rows: built.rows };
}

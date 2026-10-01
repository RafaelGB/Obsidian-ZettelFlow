/**
 * The pure core of **computed fields** (epic #632) — the dashboard-level successor to S6's per-panel
 * script transformer. A script is a `rows => rows` (now **async**) over plain value rows
 * (`{ fieldId: value }`). It is given **only** the rows plus a read-only, offline `zf` (closed over by
 * the injected `run`, never imported here) — no `app`, no `TaggedCell` internals — so this module
 * stays Obsidian-free and jest-testable (`pure-is-obsidian-free.test.ts`). The boundary that compiles
 * the function and binds `zf` is `dashboards/base/scriptTransform.ts`.
 */
import { inferFieldType } from "dashboards/datastore";
import type { DataStoreSnapshot, Row, SchemaField, TaggedCell } from "dashboards/datastore";

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

function tag(value: unknown): TaggedCell {
    if (value === null || value === undefined) return { kind: null, display: "", raw: null };
    if (typeof value === "number") return { kind: "number", display: String(value), raw: value };
    if (typeof value === "boolean") return { kind: "boolean", display: String(value), raw: value };
    if (typeof value === "string") return { kind: "category", display: value, raw: value };
    // A script may return an object/array in a cell; show it defensively, keep it a category.
    let display = "";
    try {
        if (typeof value === "object") display = JSON.stringify(value) ?? "";
        else if (typeof value === "bigint" || typeof value === "symbol") display = value.toString();
    } catch {
        display = "";
    }
    return { kind: "category", display, raw: display };
}

export function fromPlainRows(plain: PlainRow[]): { fields: SchemaField[]; rows: Row[] } {
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

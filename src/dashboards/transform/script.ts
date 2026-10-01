/**
 * The pure core of the script transformer (epic #622, S6 #628) — level 3, the advanced escape hatch.
 *
 * The user's script is a plain `(rows) => rows` over **plain value rows** — a `Record<string, number
 * | string | boolean | null>`, keyed by field id. It is given **only** the rows: no `app`, no vault,
 * no network, no `TaggedCell` internals. This module converts to/from that plain shape and runs an
 * **injected** compiled function, so it stays Obsidian-free and jest-testable; the actual function is
 * built (through the one sanctioned function-constructor home) in `base/scriptTransform.ts`.
 */
import { inferFieldType } from "dashboards/datastore";
import type { Row, SchemaField, TaggedCell } from "dashboards/datastore";

export type PlainRow = Record<string, number | string | boolean | null>;
export type ScriptRun = (rows: PlainRow[]) => unknown;
export type ScriptResult =
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

/** Run an (already compiled) script over the rows, fail-safe. The source rows are never mutated. */
export function runScriptRows(rows: Row[], run: ScriptRun): ScriptResult {
    let result: unknown;
    try {
        result = run(toPlainRows(rows));
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (!Array.isArray(result)) {
        return { ok: false, error: "The script must return an array of rows" };
    }
    const plain = result.filter((row): row is PlainRow => Boolean(row) && typeof row === "object");
    return { ok: true, ...fromPlainRows(plain) };
}

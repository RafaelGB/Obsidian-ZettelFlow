/**
 * The pure core of **computed fields** (epic #632) — the dashboard-level successor to S6's per-panel
 * script transformer. The script body runs **once per note**: it is handed that note's `row` (plain
 * values, by short name *and* by full id), its `index` and every `rows`, plus a read-only, offline
 * `zf` (closed over by the injected `run`, never imported here). It returns an object of the **new**
 * fields for that note. No `app`, no `TaggedCell` internals — so this module stays Obsidian-free and
 * jest-testable (`pure-is-obsidian-free.test.ts`). The boundary that compiles the function and binds
 * `zf` is `dashboards/base/scriptTransform.ts`.
 *
 * **Missing is a first-class value.** Most fields are absent from some notes, so a field a note does
 * not carry is `undefined` in its `row` — never a fake `0` or `""`. Arithmetic on it yields `NaN`,
 * which is stored as *empty*: a missing input makes a missing output, without the author writing a
 * guard. A note whose script throws is isolated — its new fields are empty and it is reported as a
 * skipped note, never a failed dashboard.
 *
 * A body that returns an **array** on the first note is the earlier `rows => rows` contract and is
 * honoured as such (one call, whole rows).
 */
import { inferFieldType } from "dashboards/datastore";
import type { DataStoreSnapshot, FieldType, Row, SchemaField, TaggedCell } from "dashboards/datastore";

export type PlainValue = number | string | boolean | undefined;
export type PlainRow = Record<string, PlainValue>;
/** One call of the user's body: `(row, index, rows) => newFields` (zf is bound by the boundary). */
export type ScriptRun = (row: PlainRow, index: number, rows: PlainRow[]) => unknown;

/** A note the script could not compute (it threw, or returned something that is not an object). */
export interface ComputedWarning {
    /** Row index; `null` for a warning about the script as a whole (e.g. a shadowed field name). */
    row: number | null;
    message: string;
}

export type ComputedResult =
    | {
        ok: true;
        fields: SchemaField[];
        rows: Row[];
        /** The fields the script added, in first-seen order. */
        added: SchemaField[];
        /** Notes whose script failed — their new fields are empty. */
        skipped: number;
        warnings: ComputedWarning[];
    }
    | { ok: false; error: string };

/** How a script addresses a field: the short `key` it writes for the field `id`. */
export interface RowKey {
    id: string;
    key: string;
    type: FieldType;
}

const PREFIXES = ["note.", "formula.", "file."] as const;
/** Keep the warning list readable; the count is what tells you how many notes were skipped. */
const MAX_WARNINGS = 20;

/**
 * The short name each field answers to inside `row` — `note.realWorkingHours` is `row.realWorkingHours`.
 * Note properties win a clash, then formulas, then file properties; a field whose short name is taken
 * keeps only its full id. Returned in schema order.
 */
export function rowKeys(fields: readonly SchemaField[]): RowKey[] {
    const taken = new Set(fields.map((field) => field.id));
    const shortOf = new Map<string, string>();
    for (const prefix of PREFIXES) {
        for (const field of fields) {
            if (!field.id.startsWith(prefix)) continue;
            const short = field.id.slice(prefix.length);
            if (!short || taken.has(short)) continue;
            taken.add(short);
            shortOf.set(field.id, short);
        }
    }
    return fields.map((field) => ({ id: field.id, key: shortOf.get(field.id) ?? field.id, type: field.type }));
}

/** Plain rows for the script: every field by full id and by short key, `undefined` when absent. */
export function toPlainRows(rows: readonly Row[], fields: readonly SchemaField[]): PlainRow[] {
    const keys = rowKeys(fields);
    return rows.map((row) => {
        const plain: PlainRow = {};
        for (const { id, key } of keys) {
            const raw = row[id]?.raw;
            const value = raw === null ? undefined : raw;
            plain[id] = value;
            if (key !== id) plain[key] = value;
        }
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

const EMPTY: TaggedCell = { kind: null, display: "", raw: null };

/** `NaN`/`Infinity` (what arithmetic on a missing field yields) are stored as empty, not as numbers. */
function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value));
}

function tagTyped(value: unknown, type: FieldType): TaggedCell {
    if (isEmpty(value)) return { kind: null, display: "", raw: null };
    if (type === "number") {
        const n = Number(value);
        return Number.isFinite(n) ? { kind: "number", display: display(value), raw: n } : EMPTY;
    }
    if (type === "boolean") return { kind: "boolean", display: display(value), raw: Boolean(value) };
    return { kind: type, display: display(value), raw: display(value) };
}

function tag(value: unknown): TaggedCell {
    if (isTypedCell(value)) return tagTyped(value.value, value.type);
    if (isEmpty(value)) return EMPTY;
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
    return { fields: typedFields(ids, rows), rows };
}

function typedFields(ids: readonly string[], rows: readonly Row[]): SchemaField[] {
    return ids.map((id) => ({ id, name: id, type: inferFieldType(rows.map((row) => row[id]?.kind ?? null)) }));
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Run a computed-field script over a snapshot, **once per note**, and append the fields it returns to
 * the schema — fail-safe per note. Base cells and their inferred types are never touched; a returned
 * key that names an existing field is ignored (and warned about once). Never mutates the input rows.
 */
export async function runComputed(
    base: Pick<DataStoreSnapshot, "schema" | "rows">,
    run: ScriptRun,
): Promise<ComputedResult> {
    const plain = toPlainRows(base.rows, base.schema.fields);
    const reserved = new Set(Object.keys(plain[0] ?? {}).concat(base.schema.fields.map((field) => field.id)));
    const outputs: Record<string, unknown>[] = [];
    const warnings: ComputedWarning[] = [];
    let skipped = 0;
    const warn = (row: number | null, message: string): void => {
        if (warnings.length < MAX_WARNINGS) warnings.push({ row, message });
    };

    for (let index = 0; index < plain.length; index++) {
        let out: unknown;
        try {
            out = await run(plain[index], index, plain);
        } catch (error) {
            // One note's bad data must not cost the dashboard every other note.
            skipped += 1;
            warn(index, messageOf(error));
            outputs.push({});
            continue;
        }
        if (index === 0 && Array.isArray(out)) return legacy(base, plain, out, reserved);
        if (out === null || out === undefined) {
            outputs.push({});
        } else if (typeof out !== "object" || Array.isArray(out)) {
            skipped += 1;
            warn(index, "return an object of new fields, e.g. { score: row.hours / 8 }");
            outputs.push({});
        } else {
            outputs.push(out as Record<string, unknown>);
        }
    }
    if (plain.length > 0 && skipped === plain.length) {
        return { ok: false, error: warnings[0]?.message ?? "every note failed" };
    }

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const out of outputs) {
        for (const id of Object.keys(out)) {
            if (seen.has(id)) continue;
            seen.add(id);
            if (reserved.has(id)) warn(null, `"${id}" is already a field of this Base; pick a new name`);
            else ids.push(id);
        }
    }

    const newCells: Row[] = outputs.map((out) => {
        const cells: Row = {};
        for (const id of ids) cells[id] = tag(out[id]);
        return cells;
    });
    const added = typedFields(ids, newCells);
    const rows: Row[] = base.rows.map((baseRow, index) => ({ ...baseRow, ...newCells[index] }));
    return { ok: true, fields: [...base.schema.fields, ...added], rows, added, skipped, warnings };
}

/** The earlier `return rows.map(...)` contract: the first call returned every row at once. */
function legacy(
    base: Pick<DataStoreSnapshot, "schema" | "rows">,
    plain: PlainRow[],
    result: unknown[],
    reserved: ReadonlySet<string>,
): ComputedResult {
    const objects = result.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
    const built = fromPlainRows(objects);
    if (built.rows.length === base.rows.length) {
        const added = built.fields.filter((field) => !reserved.has(field.id));
        const rows: Row[] = base.rows.map((baseRow, index) => {
            const merged: Row = { ...baseRow };
            for (const field of added) merged[field.id] = built.rows[index][field.id];
            return merged;
        });
        return { ok: true, fields: [...base.schema.fields, ...added], rows, added, skipped: 0, warnings: [] };
    }
    // A reshape (the row count changed) — take what it returned, minus the short-name aliases we added.
    const aliases = new Set(Object.keys(plain[0] ?? {}).filter((key) => !base.schema.byId[key]));
    const fields = built.fields.filter((field) => !aliases.has(field.id));
    return { ok: true, fields, rows: built.rows, added: fields, skipped: 0, warnings: [] };
}

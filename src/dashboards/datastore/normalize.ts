/**
 * Normalize an adapted Base result into the shared `DataStoreSnapshot` every panel reads (pure).
 *
 * The Bases API replaces its result object — and recreates every `BasesEntry` — on each update
 * (`obsidian.d.ts` L1131-1136), so a snapshot must never be keyed on object identity. Instead the
 * boundary derives a **signature** (file paths + visible props + sort); when it is unchanged we
 * return the previous snapshot by `===`, so an unchanged result is a genuine no-op (AC-3) and
 * downstream panels can skip re-rendering.
 */
import { AdaptedEntry, DataStoreSnapshot, FieldDescriptor, Row } from "./types";
import { inferSchema } from "./schema";

function buildIndexes(rows: Row[], fieldIds: string[]): Record<string, Record<string, number[]>> {
    const indexes: Record<string, Record<string, number[]>> = {};
    for (const id of fieldIds) indexes[id] = {};
    rows.forEach((row, rowIndex) => {
        for (const id of fieldIds) {
            const cell = row[id];
            if (!cell || cell.kind === null) continue;
            const bucket = indexes[id][cell.display] ?? (indexes[id][cell.display] = []);
            bucket.push(rowIndex);
        }
    });
    return indexes;
}

export function normalize(
    entries: AdaptedEntry[],
    properties: FieldDescriptor[],
    signature: string,
    prev?: DataStoreSnapshot,
): DataStoreSnapshot {
    // Identity-keyed memoization: same signature ⇒ reuse the prior snapshot untouched.
    if (prev && prev.signature === signature) return prev;

    const schema = inferSchema(entries, properties);
    const fieldIds = schema.fields.map((field) => field.id);
    const rows: Row[] = entries.map((entry) => entry.cells);
    const indexes = buildIndexes(rows, fieldIds);

    return {
        schema,
        rows,
        indexes,
        rowCount: rows.length,
        signature,
    };
}

/**
 * The Obsidian boundary for Base Dashboards (epic #622, S1 #623).
 *
 * This is the **only** place `instanceof` against the typed `Value` lattice runs: it maps each
 * `BasesEntry` into the plain `AdaptedEntry` the pure DataStore consumes, so `dashboards/datastore`
 * never imports `obsidian`. Values are read through the **public** `Value` surface only
 * (`instanceof`, `toString()`, `isTruthy()`) — never private internals — so it stays update-safe.
 *
 * It also derives the memo **signature** (file paths + visible props + sort): the Bases API
 * recreates its result and every `BasesEntry` on each update (`obsidian.d.ts` L1131-1136), so a
 * snapshot must key on this derived value, never on object identity.
 */
import {
    BasesEntry,
    BasesPropertyId,
    BasesQueryResult,
    BasesViewConfig,
    BooleanValue,
    DateValue,
    LinkValue,
    NullValue,
    NumberValue,
    StringValue,
    Value,
} from "obsidian";
import { AdaptedEntry, FieldDescriptor, TaggedCell } from "dashboards/datastore";

/** Map one Obsidian `Value` to a plain tagged cell. */
export function adaptValue(value: Value | null): TaggedCell {
    if (value === null || value instanceof NullValue) {
        return { kind: null, display: "", raw: null };
    }
    // Specific classes first: LinkValue extends StringValue; RelativeDateValue extends DateValue.
    if (value instanceof NumberValue) {
        const display = value.toString();
        return { kind: "number", display, raw: Number(display) };
    }
    if (value instanceof BooleanValue) {
        return { kind: "boolean", display: value.toString(), raw: value.isTruthy() };
    }
    if (value instanceof LinkValue) {
        const display = value.toString();
        return { kind: "link", display, raw: display };
    }
    if (value instanceof DateValue) {
        const display = value.toString();
        return { kind: "date", display, raw: display };
    }
    if (value instanceof StringValue) {
        const display = value.toString();
        return { kind: "category", display, raw: display };
    }
    // ListValue / ObjectValue / ErrorValue / anything new: shown, but not typed (S1).
    const display = value.toString();
    return { kind: "unknown", display, raw: display };
}

/** Adapt a single Base entry to plain cells for the visible properties. */
export function adaptEntry(entry: BasesEntry, properties: FieldDescriptor[]): AdaptedEntry {
    const cells: Record<string, TaggedCell> = {};
    for (const prop of properties) {
        cells[prop.id] = adaptValue(entry.getValue(prop.id as BasesPropertyId));
    }
    return { path: entry.file?.path ?? "", cells };
}

function buildDescriptors(result: BasesQueryResult, config?: BasesViewConfig): FieldDescriptor[] {
    const ids = result.properties ?? [];
    return ids.map((id) => ({
        id,
        name: config?.getDisplayName ? config.getDisplayName(id) : String(id),
    }));
}

/** The derived signature — changes iff file paths, visible properties, or sort change. */
export function deriveSignature(result: BasesQueryResult, config?: BasesViewConfig): string {
    const paths = (result.data ?? []).map((entry) => entry.file?.path ?? "");
    const props = (result.properties ?? []).map((id) => String(id));
    const sort = config?.getSort
        ? config.getSort().map((entry) => `${entry.property}:${entry.direction}`)
        : [];
    return JSON.stringify({ paths, props, sort });
}

export interface AdaptedResult {
    entries: AdaptedEntry[];
    properties: FieldDescriptor[];
    signature: string;
}

/** Adapt the whole query result in one pass (entries + visible fields + signature). */
export function adaptResult(result: BasesQueryResult, config?: BasesViewConfig): AdaptedResult {
    const properties = buildDescriptors(result, config);
    const entries = (result.data ?? []).map((entry) => adaptEntry(entry, properties));
    return { entries, properties, signature: deriveSignature(result, config) };
}

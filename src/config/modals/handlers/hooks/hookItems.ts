import type { PropertyHookSettings } from "config/typing";

/**
 * Pure, framework-free operations over the ordered property-hook list (#327, hardened for the
 * add-hook regression). The React manager holds `HookItem[]` as its single source of truth and mutates
 * it only through these functions, so the add/edit/delete/reorder logic is deterministic and unit-tested
 * independently of React or the DOM. Every function returns a **new** array (or the same reference when
 * nothing changes) and never mutates its input.
 */
export interface HookItem {
    property: string;
    settings: PropertyHookSettings;
}

/** Build the ordered list from the persisted record, tolerating a missing/mangled entry. */
export function toItems(record: Record<string, PropertyHookSettings> | undefined): HookItem[] {
    return Object.entries(record ?? {}).map(([property, settings]) => ({
        property,
        settings: settings ?? { script: "" },
    }));
}

/** Serialize the ordered list back to the persisted record shape. */
export function toRecord(items: HookItem[]): Record<string, PropertyHookSettings> {
    const record: Record<string, PropertyHookSettings> = {};
    for (const item of items) record[item.property] = item.settings;
    return record;
}

/** Append a hook for `property`. No-op (same reference) for a blank or already-present property. */
export function addHook(items: HookItem[], property: string): HookItem[] {
    if (!property || items.some((i) => i.property === property)) return items;
    return [...items, { property, settings: { script: "", enabled: true } }];
}

/** Patch one hook's settings, preserving order and the other hooks. */
export function updateHook(items: HookItem[], property: string, patch: Partial<PropertyHookSettings>): HookItem[] {
    return items.map((i) => (i.property === property ? { property, settings: { ...i.settings, ...patch } } : i));
}

/** Remove the hook for `property`. */
export function deleteHook(items: HookItem[], property: string): HookItem[] {
    return items.filter((i) => i.property !== property);
}

/** Move the hook at `from` to `to` (clamped/no-op for out-of-range or equal indices). */
export function reorderHooks(items: HookItem[], from: number, to: number): HookItem[] {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

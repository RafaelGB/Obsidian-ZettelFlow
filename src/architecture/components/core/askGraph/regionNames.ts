/**
 * **Regions you can rename** (#697). A region is a community the graph found (#522), named after its
 * best connected note — a guess, and a fair one. Naming is interpretive, so the name you give it is
 * yours (§XII): kept by the region's hub path in plugin data, never written into a note, and an empty
 * name gives the hub's back.
 */
export type RegionNames = Record<string, string>;

/** At most this long: a region's name is a label, not a description. */
export const REGION_NAME_MAX = 60;

/** What plugin data holds, made safe to read: strings only, trimmed, non-empty. */
export function normalizeRegionNames(raw: unknown): RegionNames {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: RegionNames = {};
    for (const [hub, name] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof name !== "string" || hub === "") continue;
        const trimmed = name.trim().slice(0, REGION_NAME_MAX);
        if (trimmed !== "") out[hub] = trimmed;
    }
    return out;
}

/** The names with one changed — or given back to the hub's, when the new name is empty or the same. */
export function withRegionName(names: RegionNames, hub: string, name: string, hubName: string): RegionNames {
    const next = { ...names };
    const trimmed = name.trim().slice(0, REGION_NAME_MAX);
    if (trimmed === "" || trimmed === hubName) delete next[hub];
    else next[hub] = trimmed;
    return next;
}

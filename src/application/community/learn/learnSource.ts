import { log, ObsidianApi } from "architecture";
import { fetchLearnCatalog } from "../services/CommunityHttpClientService";
import { parseLearnCatalog, tutorialsInTracks, type LearnCatalog } from "./learnCatalog";

/**
 * **Where Learn's catalog comes from** (#801, epic #797): the network once a session, a saved copy
 * otherwise.
 *
 * The copy lives in Obsidian's per-vault local storage (decision 3): one key holding the fetched
 * JSON, when it was fetched, and the ids already shown — never `data.json`, which every start reads
 * (#795), and never the Adapter. It is read only when Learn is shown, and nothing here runs at plugin
 * load. A failure is never a toast: the room says it inline, and the log says it at debug.
 */
export const LEARN_STORAGE_KEY = "zettelflow-learn";

/** What one key of local storage holds. The catalog is kept as fetched, and read again each time. */
interface Stored {
    catalog: unknown;
    fetchedAt: number;
    seen: string[];
}

/** How current the catalog on screen is — what the room's one inline line says. */
export type Freshness =
    | { state: "fresh" }
    /** The network failed or sent nonsense: this is the copy saved at `savedAt`. */
    | { state: "offline"; savedAt: number }
    /** The catalog is for a newer plugin. Whatever copy there is stays. */
    | { state: "update-needed" }
    /** Nothing to show: never fetched here, and no network now. */
    | { state: "empty" };

export interface LearnLoad {
    catalog: LearnCatalog | null;
    freshness: Freshness;
}

export interface SavedCatalog {
    catalog: LearnCatalog;
    fetchedAt: number;
}

export interface LearnSourceDeps {
    fetch(): Promise<unknown>;
    now(): number;
}

const DEFAULT_DEPS: LearnSourceDeps = { fetch: fetchLearnCatalog, now: () => Date.now() };

function readStored(): Stored | null {
    try {
        const value = ObsidianApi.loadLocal(LEARN_STORAGE_KEY) as Partial<Stored> | null;
        if (!value || typeof value !== "object" || typeof value.fetchedAt !== "number" || !Number.isFinite(value.fetchedAt)) return null;
        const seen = Array.isArray(value.seen) ? value.seen.filter((id): id is string => typeof id === "string") : [];
        return { catalog: value.catalog, fetchedAt: value.fetchedAt, seen };
    } catch (error) {
        log.debug("Learn: the saved catalog could not be read", error);
        return null;
    }
}

function writeStored(stored: Stored): void {
    try {
        ObsidianApi.saveLocal(LEARN_STORAGE_KEY, stored);
    } catch (error) {
        // Storage full, most likely: the catalog in memory still renders.
        log.debug("Learn: the catalog could not be saved", error);
    }
}

/** The saved copy, read for the running plugin — a tutorial newer than it stays hidden. */
export function readSaved(pluginVersion: string): SavedCatalog | null {
    const stored = readStored();
    if (!stored) return null;
    const parsed = parseLearnCatalog(stored.catalog, { pluginVersion });
    return parsed.status === "ok" ? { catalog: parsed.catalog, fetchedAt: stored.fetchedAt } : null;
}

/** The tutorial ids already shown here. */
export function seenIds(): string[] {
    return readStored()?.seen ?? [];
}

/**
 * The tutorials that are *New* (FR-12): in a track, and not yet shown. On the first visit ever
 * every id is seen at once (see {@link refresh}), so a first visit has nothing *New*.
 */
export function newIds(catalog: LearnCatalog, seen: readonly string[]): Set<string> {
    const known = new Set(seen);
    return new Set(tutorialsInTracks(catalog).map((tutorial) => tutorial.id).filter((id) => !known.has(id)));
}

/** A tutorial was opened or done: it stops being *New*. */
export function markSeen(id: string): void {
    const stored = readStored();
    if (!stored || stored.seen.includes(id)) return;
    writeStored({ ...stored, seen: [...stored.seen, id] });
}

let session: Promise<LearnLoad> | null = null;

/**
 * The catalog, fetched **at most once a session** (FR-6): the first call asks the network, every
 * later one gets the same answer until the plugin reloads. On success the copy is saved; on any
 * failure the saved copy is what is shown, and the freshness says so.
 */
export function refresh(pluginVersion: string, deps: LearnSourceDeps = DEFAULT_DEPS): Promise<LearnLoad> {
    session ??= load(pluginVersion, deps);
    return session;
}

/** Forget this session's fetch — a reload, for a test. */
export function forgetLearnSession(): void {
    session = null;
}

async function load(pluginVersion: string, deps: LearnSourceDeps): Promise<LearnLoad> {
    const before = readStored();
    const fallback = (freshness: (saved: SavedCatalog) => Freshness): LearnLoad => {
        const saved = readSaved(pluginVersion);
        return saved ? { catalog: saved.catalog, freshness: freshness(saved) } : { catalog: null, freshness: { state: "empty" } };
    };
    let raw: unknown;
    try {
        raw = await deps.fetch();
    } catch (error) {
        log.debug("Learn: the catalog could not be fetched; showing the saved copy", error);
        return fallback((saved) => ({ state: "offline", savedAt: saved.fetchedAt }));
    }
    const parsed = parseLearnCatalog(raw, { pluginVersion });
    if (parsed.status === "newer-major") {
        log.debug("Learn: the catalog is for a newer plugin; keeping the saved copy");
        const kept = fallback(() => ({ state: "update-needed" }));
        return { catalog: kept.catalog, freshness: { state: "update-needed" } };
    }
    if (parsed.status === "invalid") {
        log.debug("Learn: the fetched catalog is not one; showing the saved copy");
        return fallback((saved) => ({ state: "offline", savedAt: saved.fetchedAt }));
    }
    // The first visit ever: everything there is now has been seen, so nothing is New.
    const seen = before ? before.seen : tutorialsInTracks(parsed.catalog).map((tutorial) => tutorial.id);
    writeStored({ catalog: raw, fetchedAt: deps.now(), seen });
    return { catalog: parsed.catalog, freshness: { state: "fresh" } };
}

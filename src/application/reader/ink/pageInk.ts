/**
 * **Page ink** (#790, epic #740) — pure.
 *
 * Ink you write on a document stays on it, the way it would on paper: it is the document's, not a
 * thought. Keeping some of it as an ink note is a choice you make with the lasso, later or never.
 *
 * A book's page ink is **one file**, `<thinking space>/ink/<book>-<hash>.svg`: an SVG whose points
 * are versioned JSON in its `<metadata>`, as an ink note's drawing is — so it syncs wherever a
 * drawing syncs, and is never read as a thought (Think only reads markdown).
 *
 * The file holds **clusters**: strokes written together, anchored as one to the words they were
 * written beside (or to a printed page), so a handwritten word never comes apart when the text
 * re-flows. Two devices that both wrote are merged, never overwritten: the union of clusters by id,
 * the newest version of one both changed, and an erase that wins over what it erased.
 */

import type { TextQuote } from "application/thinking/quoteAnchor";
import type { ThoughtLocator } from "application/thinking/thought";
import { isLayer, type MarkLayer } from "application/thinking/markLayer";
import { packStrokes, unpackStrokes, type InkStrokeData, type UnreadableInk } from "./inkSvg";
import type { InkSide } from "./inkAnchor";

export const PAGE_INK_VERSION = 1;
export const PAGE_INK_METADATA_ID = "zettelflow-page-ink";
/** How long an erase is remembered, so a device that comes back with the stroke cannot revive it. */
export const PAGE_INK_TOMBSTONE_MS = 90 * 24 * 60 * 60 * 1000;
/** The subfolder of the thinking space a book's page ink lives in. */
export const PAGE_INK_FOLDER = "ink";

/** Where a cluster is: beside words of a chapter (as an ink note is), or on a printed page. */
export type PageInkPlace =
    | { view: "text"; locator: ThoughtLocator | null; quote: TextQuote | null; side: InkSide; x: number; line: number; em: number }
    | { view: "page"; locator: ThoughtLocator; px: number; py: number; pw: number; ph: number };

export interface PageInkCluster {
    id: string;
    /** When it was last changed, by the writing device's clock: what a merge keeps the newest of. */
    at: number;
    place: PageInkPlace;
    /** In ems, from the cluster's origin. */
    strokes: InkStrokeData[];
    /** The layer it was written on (#758); absent is reading. */
    layer?: MarkLayer;
}

export interface PageInk {
    about: string;
    clusters: PageInkCluster[];
    /** Erased clusters, by id, with when: an erase wins over any version as old or older. */
    erased: Record<string, number>;
}

export function emptyPageInk(about: string): PageInk {
    return { about, clusters: [], erased: {} };
}

/** A short, stable hash of a path: the same file name on every device. */
export function fnv1a8(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** Where a book's page ink lives. The book itself is never written. */
export function pageInkPath(folder: string, about: string): string {
    const base = (about.split("/").pop() ?? about).replace(/\.[^.]+$/, "");
    const slug = base.replace(/[\\/:*?"<>|#^[\]]+/g, " ").trim().slice(0, 60) || "ink";
    return `${folder}/${PAGE_INK_FOLDER}/${slug}-${fnv1a8(about)}.svg`;
}

/** Which chapter a text cluster belongs to: its identity in the file, else its place. */
export function chapterKey(locator: Pick<ThoughtLocator, "at" | "chapter"> | null | undefined): string {
    return locator?.chapter ?? `at:${locator?.at ?? 0}`;
}

/** A cluster written or changed: it replaces the one with its id. */
export function putCluster(doc: PageInk, cluster: PageInkCluster): PageInk {
    return { ...doc, clusters: [...doc.clusters.filter((c) => c.id !== cluster.id), cluster] };
}

/** A cluster erased: gone, and remembered as erased so a merge cannot bring it back. */
export function dropCluster(doc: PageInk, id: string, at: number): PageInk {
    return { ...doc, clusters: doc.clusters.filter((c) => c.id !== id), erased: { ...doc.erased, [id]: Math.max(at, doc.erased[id] ?? 0) } };
}

/** Two copies of one book's ink as one: never last-writer-wins. Commutative and idempotent. */
export function mergePageInk(a: PageInk, b: PageInk, now: number): PageInk {
    const erased: Record<string, number> = {};
    for (const source of [a.erased, b.erased]) {
        for (const [id, at] of Object.entries(source)) {
            if (now - at > PAGE_INK_TOMBSTONE_MS) continue;
            erased[id] = Math.max(at, erased[id] ?? 0);
        }
    }
    const byId = new Map<string, PageInkCluster>();
    for (const cluster of [...a.clusters, ...b.clusters]) {
        const held = byId.get(cluster.id);
        if (!held || cluster.at > held.at || (cluster.at === held.at && cluster !== held && weight(cluster) > weight(held))) byId.set(cluster.id, cluster);
    }
    const clusters = [...byId.values()].filter((cluster) => !(cluster.id in erased && erased[cluster.id] >= cluster.at));
    return { about: a.about || b.about, clusters, erased };
}

/** Two versions of one cluster changed in the same millisecond: the one with more ink, so either order agrees. */
function weight(cluster: PageInkCluster): number {
    return cluster.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) * 1000 + cluster.strokes.length;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** A cluster's file form, made once: a cluster is never changed in place, only replaced. */
const packed = new WeakMap<PageInkCluster, unknown>();
function packCluster(cluster: PageInkCluster): unknown {
    let made = packed.get(cluster);
    if (!made) {
        made = { id: cluster.id, at: cluster.at, place: packPlace(cluster.place), ...(cluster.layer ? { layer: cluster.layer } : {}), strokes: packStrokes(cluster.strokes) };
        packed.set(cluster, made);
    }
    return made;
}

function packPlace(place: PageInkPlace): Record<string, unknown> {
    if (place.view === "page") return { view: "page", locator: place.locator, px: round4(place.px), py: round4(place.py), pw: round4(place.pw), ph: round4(place.ph) };
    return { view: "text", locator: place.locator, quote: place.quote, side: place.side, x: round4(place.x), line: round4(place.line), em: round4(place.em) };
}

/** The book's ink as its file. A pure function: clusters in order of id, so two renders are byte-equal. */
export function renderPageInk(doc: PageInk): string {
    const clusters = [...doc.clusters].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const erased = Object.fromEntries(Object.entries(doc.erased).sort(([x], [y]) => (x < y ? -1 : 1)));
    const data = {
        v: PAGE_INK_VERSION,
        about: doc.about,
        clusters: clusters.map(packCluster),
        erased,
    };
    return [`<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">`, `<metadata id="${PAGE_INK_METADATA_ID}">${JSON.stringify(data)}</metadata>`, "</svg>", ""].join("\n");
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

function readLocator(raw: unknown): ThoughtLocator | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const at = num(r.at);
    if (at === null) return null;
    const chapter = str(r.chapter);
    const page = str(r.page);
    return { at, label: str(r.label) ?? "", ...(chapter ? { chapter } : {}), ...(page ? { page } : {}) };
}

function readQuote(raw: unknown): TextQuote | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const exact = str(r.exact);
    return exact ? { exact, prefix: str(r.prefix) ?? "", suffix: str(r.suffix) ?? "" } : null;
}

function readPlace(raw: unknown): PageInkPlace | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (r.view === "page") {
        const locator = readLocator(r.locator);
        const [px, py, pw, ph] = [r.px, r.py, r.pw, r.ph].map(num);
        if (!locator || px === null || py === null || pw === null || ph === null) return null;
        return { view: "page", locator, px, py, pw, ph };
    }
    if (r.view === "text") {
        const [x, line, em] = [r.x, r.line, r.em].map(num);
        const side = r.side === "left" || r.side === "right" || r.side === "text" ? r.side : null;
        if (x === null || line === null || em === null || !side) return null;
        return { view: "text", locator: readLocator(r.locator), quote: readQuote(r.quote), side, x, line, em };
    }
    return null;
}

/**
 * The book's ink read back from its file: only our own metadata is read. A version this build does
 * not know, or a file it cannot parse, is `unreadable` — and an unreadable file is never written over.
 */
export function parsePageInk(text: string): PageInk | UnreadableInk {
    // Found by position, not a lazy pattern: the file can be megabytes.
    const open = `<metadata id="${PAGE_INK_METADATA_ID}">`;
    const start = text.indexOf(open);
    const end = start < 0 ? -1 : text.indexOf("</metadata>", start);
    if (start < 0 || end < 0) return { unreadable: true, version: null };
    let data: unknown;
    try {
        data = JSON.parse(text.slice(start + open.length, end));
    } catch {
        return { unreadable: true, version: null };
    }
    if (!data || typeof data !== "object") return { unreadable: true, version: null };
    const record = data as { v?: unknown; about?: unknown; clusters?: unknown; erased?: unknown };
    const version = num(record.v);
    if (version !== PAGE_INK_VERSION || !Array.isArray(record.clusters)) return { unreadable: true, version };
    const clusters: PageInkCluster[] = [];
    for (const raw of record.clusters) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const id = str(r.id);
        const at = num(r.at);
        const place = readPlace(r.place);
        const strokes = unpackStrokes(r.strokes);
        if (!id || at === null || !place || strokes.length === 0) continue;
        clusters.push({ id, at, place, strokes, ...(isLayer(r.layer) ? { layer: r.layer } : {}) });
    }
    const erased: Record<string, number> = {};
    if (record.erased && typeof record.erased === "object") {
        for (const [id, at] of Object.entries(record.erased as Record<string, unknown>)) {
            const when = num(at);
            if (when !== null) erased[id] = when;
        }
    }
    return { about: str(record.about) ?? "", clusters, erased };
}

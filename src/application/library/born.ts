import { sourceFormat } from "./sourceMeta";
import { placeLabel, readSourceEntry, samePlace, type PassagePlace } from "./provenance";

/**
 * **Notes born from a source** (#683, epic #675) — pure, over what the knowledge model already
 * holds.
 *
 * A note cites a source the way #148 reads it: a `source` field whose value links the file
 * (`source: "[[Thinking, Fast and Slow.epub]] p. 42"`). A crystallized passage writes exactly that
 * (L6), and so does anyone who cites a book by hand — both count, because both are notes that came
 * from it. Only links count: a source written as plain text names no file.
 */

/** The little of an idea this needs: its path and the sources its claims carry. */
export interface CitingIdea {
    path: string;
    claims: readonly { sources: readonly { ref: string; kind?: string }[] }[];
}

/** The notes citing each PDF or EPUB, by the source's path, each list in path order. */
export function notesBornFrom(ideas: Iterable<CitingIdea>): Map<string, string[]> {
    const out = new Map<string, Set<string>>();
    for (const idea of ideas) {
        for (const claim of idea.claims) {
            for (const source of claim.sources) {
                if (source.kind !== "link" || !sourceFormat(source.ref)) continue;
                let notes = out.get(source.ref);
                if (!notes) out.set(source.ref, (notes = new Set()));
                notes.add(idea.path);
            }
        }
    }
    return new Map([...out].map(([source, notes]) => [source, [...notes].sort()]));
}

/**
 * Where a note says it came from in a source, read off a `source` value: the source's link and what
 * follows it (`p. 42`, `3 · The lazy controller`). `null` when the value cites no PDF or EPUB.
 * Pure on the text; resolving the link is the caller's.
 */
export function citedLocator(value: string): { link: string; locator: string } | null {
    const match = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*(.*)$/.exec(value.trim());
    if (!match || !sourceFormat(match[1].trim())) return null;
    return { link: match[1].trim(), locator: match[2].replace(/^["']|["']$/g, "").trim() };
}

/** Where a note came from in a source: the link, how the row reads it, and — since #751 — the passage. */
export interface NoteOrigin {
    link: string;
    /** `p. 42`, `3 · The lazy controller`: what follows the link, or the place's own page or chapter. */
    locator: string;
    /** The passage itself, when the note was made after #751: its chapter and its opening words. */
    place?: PassagePlace;
}

/** A YAML scalar as it is written: `"…"` (JSON-compatible), `'…'`, or plain. */
function yamlScalar(raw: string): string {
    const value = raw.trim();
    if (value.startsWith('"')) {
        try {
            const parsed: unknown = JSON.parse(value);
            if (typeof parsed === "string") return parsed;
        } catch {
            // Not JSON after all: read it as written.
        }
        return value.replace(/^"|"$/g, "");
    }
    if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1).replace(/''/g, "'");
    return value;
}

const SOURCE_KEY = /^(?:source|sources)$/i;

/** The `source` values of a note: its frontmatter (as Obsidian read it, or as written) and its `source::` lines. */
function sourceValues(markdown: string, frontmatter?: Readonly<Record<string, unknown>> | null): string[] {
    const out: string[] = [];
    const lines = markdown.split(/\r?\n/);
    let inFront = lines[0]?.trim() === "---";
    let inList = false;
    if (frontmatter) {
        for (const [key, value] of Object.entries(frontmatter)) {
            if (!SOURCE_KEY.test(key)) continue;
            for (const item of Array.isArray(value) ? value : [value]) if (typeof item === "string") out.push(item);
        }
    }
    for (let i = inFront ? 1 : 0; i < lines.length; i++) {
        const line = lines[i];
        if (inFront) {
            if (line.trim() === "---") {
                inFront = false;
                continue;
            }
            // Obsidian's own reading of the properties wins over reading them off the text.
            if (frontmatter) continue;
            const item = /^\s+-\s+(.+)$/.exec(line);
            if (inList && item) {
                out.push(yamlScalar(item[1]));
                continue;
            }
            const field = /^(source|sources)\s*:\s*(.*)$/i.exec(line);
            inList = Boolean(field && !field[2].trim());
            if (field && field[2].trim()) out.push(yamlScalar(field[2]));
            continue;
        }
        const field = /^\s*(?:[-*]\s+)?(?:source|sources)\s*::?\s*(.+)$/i.exec(line);
        if (field) out.push(yamlScalar(field[1]));
    }
    return out;
}

/**
 * Every PDF or EPUB a note cites (#683): its `source` values — the frontmatter `source:` (a value or
 * a list) and the inline `source::` — in the order they are written. Read through `readSourceEntry`
 * (#751): a passage's entry carries its place. A citation of a book that a passage of the same book
 * already cites says less, and goes — so a crystallized note shows its book once (FR-4).
 * `frontmatter` is Obsidian's own reading of the properties, when the caller has it.
 */
export function noteOrigins(markdown: string, frontmatter?: Readonly<Record<string, unknown>> | null): NoteOrigin[] {
    const found: NoteOrigin[] = [];
    for (const value of sourceValues(markdown, frontmatter)) {
        const cited = citedLocator(value);
        if (!cited) continue;
        const read = readSourceEntry(value);
        const place = read && (read.chapter || read.quote) ? read : undefined;
        found.push(place ? { link: cited.link, locator: placeLabel(place), place } : cited);
    }
    const out: NoteOrigin[] = [];
    for (const origin of found) {
        if (origin.place) {
            const place = origin.place;
            if (out.some((kept) => kept.place && samePlace(kept.place, place))) continue;
            // A plain citation of the same book, already listed: the passage takes its row.
            const plain = out.findIndex((kept) => !kept.place && kept.link === origin.link);
            if (plain >= 0) out.splice(plain, 1, origin);
            else out.push(origin);
            continue;
        }
        if (out.some((kept) => kept.link === origin.link && (kept.place || kept.locator === origin.locator))) continue;
        out.push(origin);
    }
    return out;
}

/** The page a locator names (`p. 42` → 41, from 0), when it names one. */
export function pageOf(locator: string): number | null {
    const match = /^p(?:p|ág|age)?\.?\s*(\d+)/i.exec(locator.trim());
    return match ? Math.max(0, Number(match[1]) - 1) : null;
}

/** Just the counts, for the shelf. */
export function bornCounts(born: ReadonlyMap<string, readonly string[]>): Map<string, number> {
    return new Map([...born].map(([source, notes]) => [source, notes.length]));
}


import { sourceFormat } from "./sourceMeta";

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

/**
 * Every PDF or EPUB a note cites (#683): its `source` lines — inline `source::` and the frontmatter
 * `source:` — in the order they are written, each once.
 */
export function noteOrigins(markdown: string): { link: string; locator: string }[] {
    const out: { link: string; locator: string }[] = [];
    const seen = new Set<string>();
    for (const line of markdown.split(/\r?\n/)) {
        const field = /^\s*(?:[-*]\s+)?(?:source|sources)\s*::?\s*(.+)$/i.exec(line);
        if (!field) continue;
        const cited = citedLocator(field[1].replace(/^["']|["']$/g, ""));
        if (!cited || seen.has(`${cited.link}|${cited.locator}`)) continue;
        seen.add(`${cited.link}|${cited.locator}`);
        out.push(cited);
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


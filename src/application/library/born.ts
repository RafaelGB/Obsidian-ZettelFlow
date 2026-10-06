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

/** Just the counts, for the shelf. */
export function bornCounts(born: ReadonlyMap<string, readonly string[]>): Map<string, number> {
    return new Map([...born].map(([source, notes]) => [source, notes.length]));
}


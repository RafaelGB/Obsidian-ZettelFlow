import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { isNoteNeighbour } from "./neighbourhood";

/**
 * **Reading paths** (#667) — the order the Reader walks your notes in.
 *
 * Pure: a path is an interpretation of the vault for one sitting, built from what the model already
 * knows. It never writes anything, and it needs no MOC: you right-click a note and read from there.
 * R1 (#668) ships the simplest honest path; R2 (#669) adds Argument, Story, Essentials and Region.
 */

/** What a chapter is to the note you started from, read off the typed relations (#147). */
export type ChapterRole = "thesis" | "support" | "counter" | "synthesis" | "context";

export interface ReadingChapter {
    path: string;
    role: ChapterRole;
}

export interface ReadingPath {
    /** The note you chose to read from. */
    seed: string;
    chapters: ReadingChapter[];
}

/** A path longer than this stops being a reading and becomes a crawl. */
export const READING_PATH_CAP = 12;

/** The relation between the seed and another note, in either direction. */
function relationBetween(model: KnowledgeModel, seed: string, other: string): string | undefined {
    const out = model.get(seed)?.relations.find((relation) => relation.to === other)?.type;
    const back = model.get(other)?.relations.find((relation) => relation.to === seed)?.type;
    if (out === "contradicts" || back === "contradicts") return "contradicts";
    if (out === "supports" || back === "supports") return "supports";
    return out ?? back;
}

function roleOf(relation: string | undefined): ChapterRole {
    if (relation === "supports") return "support";
    if (relation === "contradicts") return "counter";
    return "context";
}

/**
 * **Read from here** (#668): the seed, then the notes it links to in the order it links them, then
 * the notes that link to it, by title. Only notes the model knows (no unresolved links, no
 * attachments, no self-links), at most {@link READING_PATH_CAP} chapters.
 *
 * The seed is the *thesis* when something supports or argues with it, and *context* otherwise: a
 * role is only claimed where the relations say so.
 */
export function readFromHere(model: KnowledgeModel, seed: string, cap: number = READING_PATH_CAP): ReadingPath {
    const idea = model.get(seed);
    if (!idea) return { seed, chapters: [{ path: seed, role: "context" }] };

    const seen = new Set<string>([seed]);
    const order: string[] = [];
    const take = (path: string) => {
        if (seen.has(path) || !isNoteNeighbour(model, seed, path)) return;
        seen.add(path);
        order.push(path);
    };
    for (const relation of idea.relations) take(relation.to);
    const title = (path: string) => model.get(path)?.title ?? path;
    for (const path of model.inNeighbors(seed).sort((a, b) => title(a).localeCompare(title(b)))) take(path);

    const others = order.slice(0, Math.max(0, cap - 1)).map((path) => ({
        path,
        role: roleOf(relationBetween(model, seed, path)),
    }));
    const argued = others.some((chapter) => chapter.role === "support" || chapter.role === "counter");
    return { seed, chapters: [{ path: seed, role: argued ? "thesis" : "context" }, ...others] };
}

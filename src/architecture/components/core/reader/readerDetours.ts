import type { ReadingChapter, ReadingPath } from "architecture/knowledge/state";

/**
 * Peeks and detours (#670, epic #667) — the pure part.
 *
 * Getting lost is the main way reading fails in a linked vault: you follow a link, then another, and
 * the thread is gone. So a link in the Reader is a **peek** first, and following it is a **detour**:
 * a stack with a way back, never a jump that loses your place.
 */

/** How deep detours may nest. Past it, the newest detour replaces the deepest, so the way back holds. */
export const DETOUR_DEPTH = 5;

/** Read `path` as a detour from where you are. Reading what you are already reading changes nothing. */
export function pushDetour(stack: readonly string[], path: string, current: string): string[] {
    if (path === current || stack[stack.length - 1] === path) return [...stack];
    if (stack.length >= DETOUR_DEPTH) return [...stack.slice(0, DETOUR_DEPTH - 1), path];
    return [...stack, path];
}

/** One level back: the previous detour, or the chapter you left from. */
export function popDetour(stack: readonly string[]): string[] {
    return stack.slice(0, -1);
}

/** Where a note sits in this reading: its chapter index, or -1 when it is outside it. */
export function placeInPath(chapters: readonly ReadingChapter[], path: string): number {
    return chapters.findIndex((chapter) => chapter.path === path);
}

/**
 * Add a note to this reading, right after the chapter you are on. For this reading only: the path
 * is a reading, not a file, and nothing about it is written anywhere.
 */
export function addToReading(path: ReadingPath, afterIndex: number, note: string): ReadingPath {
    if (placeInPath(path.chapters, note) >= 0) return path;
    const chapters = [...path.chapters];
    chapters.splice(afterIndex + 1, 0, { path: note, role: "context" });
    return { ...path, chapters };
}

/**
 * The first paragraph of a note, as plain text, for a peek: no properties, no headings' markers, no
 * markup — links read as their words, embeds and code drop out. Cut at a word boundary.
 */
export function plainExcerpt(markdown: string, max = 240): string {
    const body = markdown
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/!\[\[[^\]]*\]\]/g, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    const paragraphs = body
        .split(/\r?\n\s*\r?\n/)
        // A heading on its own says what the note is called, not what it says.
        .filter((block) => !block.trim().split(/\r?\n/).every((line) => /^\s*#{1,6}\s/.test(line)))
        .map((block) =>
            block
                .split(/\r?\n/)
                .map((line) => line.replace(/^\s*(#{1,6}\s+|>\s*(\[![^\]]*\][+-]?\s*)?|[-*+]\s+|\d+\.\s+)/, ""))
                .join(" ")
        )
        .map((text) =>
            text
                .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
                .replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.split("#")[0])
                .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
                .replace(/(\*\*|__|\*|_|~~|==|`)/g, "")
                .replace(/\s+/g, " ")
                .trim()
        )
        .filter((text) => text.length > 0 && !/^[\w-]+::/.test(text));
    const first = paragraphs[0] ?? "";
    if (first.length <= max) return first;
    const cut = first.slice(0, max);
    const space = cut.lastIndexOf(" ");
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

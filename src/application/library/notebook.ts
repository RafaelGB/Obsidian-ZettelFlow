/**
 * The book notebook (#721, epic #723): everything you marked in one book or paper, in one place.
 *
 * Pure. Highlights and margin notes are thoughts about the source; here they are grouped by where
 * they are in it, counted, narrowed, and — when you ask — written out as one reading note. The note
 * cites pages as text, never as a block id: two quotes from one page must not collide.
 */
import type { Thought } from "application/thinking/thought";
import { HIGHLIGHT_MEANINGS, meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";

export interface NotebookEntry {
    id: string;
    /** The chapter or page, by index in the source; `null` when the thought does not say. */
    at: number | null;
    /** How the source cites the place: `p. 9`, `Ch. 4 · Deep modules`. */
    label: string;
    /** The passage; empty for a note written beside a page with no text. */
    quote: string;
    note: string;
    meaning: HighlightMeaning;
    /** The thought itself, for opening it in the Reader or making a note of it. */
    thought: Thought;
}

export interface NotebookGroup {
    /** The chapter, or the section a page sits in. */
    title: string;
    entries: NotebookEntry[];
}

export interface Notebook {
    groups: NotebookGroup[];
    /** Passages marked. */
    highlights: number;
    /** Entries that carry a note of yours. */
    notes: number;
    byMeaning: Record<HighlightMeaning, number>;
}

export function buildNotebook(
    thoughts: readonly Thought[],
    labelOf: (at: number) => string,
    /** The section a place sits in, when the source names one (a paper's outline). */
    sectionOf: (at: number) => string | undefined = () => undefined
): Notebook {
    const entries: NotebookEntry[] = thoughts
        .filter((thought) => thought.quote?.exact || thought.text.trim())
        .map((thought) => {
            const at = thought.locator?.at ?? null;
            return {
                id: thought.id,
                at,
                label: at === null ? "" : thought.locator?.label || labelOf(at),
                quote: thought.quote?.exact ?? "",
                note: thought.text.trim(),
                meaning: meaningOf(thought),
                thought,
            };
        })
        // Reading order: by place in the source, then the order you marked them.
        .sort((a, b) => (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER) || a.thought.at - b.thought.at);
    const groups: NotebookGroup[] = [];
    for (const entry of entries) {
        const title = entry.at === null ? "" : sectionOf(entry.at) || entry.label;
        const last = groups[groups.length - 1];
        if (last && last.title === title) last.entries.push(entry);
        else groups.push({ title, entries: [entry] });
    }
    const byMeaning = Object.fromEntries(HIGHLIGHT_MEANINGS.map((meaning) => [meaning, 0])) as Record<HighlightMeaning, number>;
    for (const entry of entries) if (entry.quote) byMeaning[entry.meaning]++;
    return {
        groups,
        highlights: entries.filter((entry) => entry.quote).length,
        notes: entries.filter((entry) => entry.note).length,
        byMeaning,
    };
}

/** Only one meaning, or only what carries a note; a chapter left with nothing is dropped. */
export function filterNotebook(groups: readonly NotebookGroup[], filter: { meaning?: HighlightMeaning | null; withNotes?: boolean }): NotebookGroup[] {
    return groups
        .map((group) => ({
            ...group,
            entries: group.entries.filter(
                (entry) => (!filter.meaning || (entry.quote !== "" && entry.meaning === filter.meaning)) && (!filter.withNotes || entry.note !== "")
            ),
        }))
        .filter((group) => group.entries.length > 0);
}

/**
 * The reading note: a title, the source as a link, then per chapter its quotes (with the page, in a
 * paper) and your notes as bullets. Plain Markdown, no frontmatter.
 */
export function readingNoteMarkdown(input: { title: string; sourceLink: string; groups: readonly NotebookGroup[] }): string {
    const lines: string[] = [`# ${input.title}`, "", `Source:: ${input.sourceLink}`, ""];
    for (const group of input.groups) {
        if (group.title) lines.push(`## ${group.title}`, "");
        for (const entry of group.entries) {
            if (entry.quote) {
                // The page goes after the passage only when the heading does not already say it.
                const cite = entry.label && entry.label !== group.title ? ` (${entry.label})` : "";
                const quoted = entry.quote.split(/\r?\n/).map((line) => `> ${line}`);
                quoted[quoted.length - 1] += cite;
                lines.push(...quoted, "");
            }
            if (entry.note) lines.push(...entry.note.split(/\r?\n/).map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`)), "");
        }
    }
    return lines.join("\n");
}

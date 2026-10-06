import { isHighlight, type Thought } from "./thought";

/**
 * Turning chaos into knowledge, without losing the chaos (#468, epic #465) — pure.
 *
 * Zettelkasten rewards thought that is already clean. A note arrives with a title, a claim and
 * its sources, and the twenty minutes of contradiction that produced it are gone. What survives
 * is the conclusion, never the reasoning that earned it — which is exactly the part you need when
 * you come back in a year and wonder whether you still believe it.
 *
 * Crystallization is the **only** door between the Lab and the vault, and it has two jobs: make a
 * real note, and keep the archaeology.
 *
 * ## Why provenance is kept twice
 *
 * Links let you navigate back. Frozen quotes survive the Lab being emptied. A record that points
 * at a deleted file answers nothing, so the note carries **both** — the same reasoning that makes
 * the write record keep previous values rather than a pointer (#453).
 *
 * ## It is the §XII verdict
 *
 * The constitution already requires that interpretive output reach the vault only through an
 * explicit human accept/modify/reject, recorded. In the rest of the product that is a defensive
 * guardrail on AI and heuristics. Here it is the central mechanic: the Lab is where interpretation
 * happens, and this is the gate it passes through. Nothing crystallizes automatically, ever.
 */

/** How much of a thought is quoted in the provenance. Enough to recognise, not a second copy. */
export const FROZEN_QUOTE_LIMIT = 140;

/** How many thoughts are quoted before the rest are counted instead of listed. */
export const FROZEN_QUOTE_MAX = 12;

export interface FrozenOrigin {
    /** The thought's file path, for navigating back while it still exists. */
    path?: string;
    /** What it said, frozen, so the record survives the Lab being emptied. */
    quote: string;
    at: number;
}

export interface Crystallization {
    /** Proposed, never imposed. The first line of the oldest thought, which is usually the seed. */
    title: string;
    /** Proposed body: the thoughts, in the order they were thought. */
    body: string;
    /** Paths to link back to, when the thoughts are on disk. */
    bornFrom: string[];
    /** The frozen record, which outlives the thoughts. */
    frozen: FrozenOrigin[];
    /** How many thoughts were left out of the quotes because of the cap. */
    omitted: number;
    /**
     * Where the passages came from (#679), as links with a locator — `Notes/Event sourcing#Events`
     * today, a page of a PDF tomorrow (#675). Written as `source::` lines, so the note is
     * recognised as **sourced** by the claim/source parser (#148).
     */
    sources?: string[];
}

/**
 * The words a thought brings to a note. A highlight brings its passage, quoted, then your margin
 * note — a highlight with no note still has something to say (#679).
 */
function wordsOf(thought: Thought): string {
    const own = thought.text.trim();
    if (!isHighlight(thought)) return own;
    const passage = `> ${(thought.quote?.exact ?? "").replace(/\s+/g, " ").trim()}`;
    return own ? `${passage}\n\n${own}` : passage;
}

/**
 * The link that cites a highlight's passage: the note, and the heading it sat under. A passage of
 * a PDF or an EPUB (#683) cites the file — its extension kept, so the link resolves — and the
 * place in it as a reader writes it: `[[Thinking, Fast and Slow.epub]] p. 42`.
 */
export function citationOf(thought: Thought): string | undefined {
    if (!isHighlight(thought) || !thought.about) return undefined;
    if (thought.locator) {
        const where = thought.locator.label.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
        return `[[${thought.about}]]${where ? ` ${where}` : ""}`;
    }
    const note = thought.about.replace(/\.md$/i, "");
    const heading = thought.quote?.heading?.replace(/[#|[\]^]/g, " ").replace(/\s+/g, " ").trim();
    return `[[${note}${heading ? `#${heading}` : ""}]]`;
}

function firstLine(text: string): string {
    return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function clip(text: string, limit: number): string {
    const single = text.replace(/\s+/g, " ").trim();
    return single.length <= limit ? single : `${single.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Propose a note from a selection of thoughts.
 *
 * Oldest first, because that is the order you thought them and the order the reasoning reads in.
 * The title is a **proposal** taken from the seed thought; a proposal that is hard to change is an
 * imposition, so the caller must let it be edited before anything is written.
 */
export function planCrystallization(
    thoughts: readonly Thought[],
    paths: Readonly<Record<string, string>> = {}
): Crystallization | undefined {
    const chosen = [...thoughts].filter((thought) => wordsOf(thought)).sort((a, b) => a.at - b.at);
    if (chosen.length === 0) return undefined;

    const quoted = chosen.slice(0, FROZEN_QUOTE_MAX);
    const seed = chosen[0];
    const sources = [...new Set(chosen.map(citationOf).filter((link): link is string => Boolean(link)))];
    return {
        // A highlight's title is proposed from your note about it, or else from its passage.
        title: clip(firstLine(seed.text) || firstLine(seed.quote?.exact ?? ""), 80),
        body: chosen.map(wordsOf).join("\n\n"),
        bornFrom: chosen.map((thought) => paths[thought.id]).filter((path): path is string => Boolean(path)),
        frozen: quoted.map((thought) => ({
            ...(paths[thought.id] ? { path: paths[thought.id] } : {}),
            quote: clip(thought.text.trim() || (thought.quote?.exact ?? ""), FROZEN_QUOTE_LIMIT),
            at: thought.at,
        })),
        omitted: chosen.length - quoted.length,
        sources,
    };
}

/**
 * The provenance section, as markdown.
 *
 * Frozen **text**, not transclusions: deleting the Lab must leave this paragraph readable, which
 * is the whole point of keeping it.
 */
export function renderProvenance(
    plan: Crystallization,
    heading: string,
    omittedLine: (count: string) => string
): string {
    const lines = [`## ${heading}`];
    for (const origin of plan.frozen) lines.push(`- "${origin.quote}"`);
    if (plan.omitted > 0) lines.push(`- ${omittedLine(String(plan.omitted))}`);
    return lines.join("\n");
}

/**
 * The full note: your text, then where it came from — and, when it was read somewhere, the
 * `source::` lines that cite it (#679). Outside the editable body on purpose: a citation you can
 * delete by tidying the text is a citation that quietly disappears.
 */
export function renderCrystallized(
    plan: Crystallization,
    body: string,
    heading: string,
    omittedLine: (count: string) => string
): string {
    const cited = (plan.sources ?? []).map((link) => `source:: ${link}`);
    const tail = cited.length > 0 ? `\n\n${cited.join("\n")}` : "";
    return `${body.trim()}\n\n${renderProvenance(plan, heading, omittedLine)}${tail}\n`;
}

/**
 * The block a thread adds to the note it was about (#474, epic #472).
 *
 * A thread with a subject is a one-way street without this: you crossed over to think, worked
 * something out, and the only thing crystallization knew how to do was create a *new* note —
 * leaving the one you came from exactly as unfinished as when you left it.
 *
 * It is an **append**, never a rewrite. Nothing already in the note is touched, and the
 * provenance rule is #468's unchanged: frozen quotes, so the record outlives the Lab.
 */
export function renderReturn(
    plan: Crystallization,
    body: string,
    heading: string,
    provenanceHeading: string,
    omittedLine: (count: string) => string
): string {
    const lines = [`## ${heading}`, "", body.trim(), ""];
    lines.push(renderProvenance(plan, provenanceHeading, omittedLine));
    return lines.join("\n");
}

/** Where a crystallization can land, given what the thread knows about itself. */
export type Destination = "new-note" | "back";

/**
 * The destinations open to this thread.
 *
 * `back` only when the thread has a subject **and** that note still exists — offering to append
 * to something that is gone is offering to fail.
 */
export function destinationsFor(subject: string | undefined, subjectExists: boolean): Destination[] {
    // Only a note can take thinking back: a PDF or an EPUB is never written (#675 L5).
    const note = Boolean(subject && /\.md$/i.test(subject));
    return note && subjectExists ? ["back", "new-note"] : ["new-note"];
}

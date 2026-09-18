import type { Thought } from "./thought";

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
    const chosen = [...thoughts].filter((thought) => thought.text.trim()).sort((a, b) => a.at - b.at);
    if (chosen.length === 0) return undefined;

    const quoted = chosen.slice(0, FROZEN_QUOTE_MAX);
    return {
        title: clip(firstLine(chosen[0].text), 80),
        body: chosen.map((thought) => thought.text.trim()).join("\n\n"),
        bornFrom: chosen.map((thought) => paths[thought.id]).filter((path): path is string => Boolean(path)),
        frozen: quoted.map((thought) => ({
            ...(paths[thought.id] ? { path: paths[thought.id] } : {}),
            quote: clip(thought.text, FROZEN_QUOTE_LIMIT),
            at: thought.at,
        })),
        omitted: chosen.length - quoted.length,
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

/** The full note: your text, then where it came from. */
export function renderCrystallized(
    plan: Crystallization,
    body: string,
    heading: string,
    omittedLine: (count: string) => string
): string {
    return `${body.trim()}\n\n${renderProvenance(plan, heading, omittedLine)}\n`;
}

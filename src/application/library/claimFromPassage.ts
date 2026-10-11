import type { Thought } from "application/thinking/thought";

/**
 * **Make it a claim** (#762, epic #741) — pure: the note a passage of a book becomes when you say
 * what you would defend about it.
 *
 * The note is ordinary markdown, readable with the plugin gone:
 *
 * ```
 * ---
 * claim: "Big projects fail by underestimating complexity"
 * source:
 *   - "[[Books/How Big Things Get Done.epub#OEBPS/ch02.xhtml|How Big Things Get Done]] p. 143 · 2 · Think slow · “…‹the planning fallacy›…”"
 * ---
 *
 * > This is the planning fallacy, or the planning bias, as some call it.
 * ```
 *
 * - `claim` is the one sentence, JSON-quoted (a colon or a quote in it stays safe), so the claim
 *   parser (#148) reads it at once — *Research* in Alongside, the evidence map, claim returns;
 * - `source` is #751's written form (`sourceEntry`), the one every note from a book carries;
 * - the body is the passage, quoted, with its whitespace folded.
 *
 * You never write YAML (§XIII): the sheet does, from the words you typed.
 */

export interface ClaimNote {
    /** The one sentence you would defend. */
    claim: string;
    /** The passage's words, as you selected them. */
    passage: string;
    /** The passage's place, as #751's `sourceEntry` writes it. */
    entry: string;
}

/** The text with its whitespace folded to single spaces, trimmed. */
function flat(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

/** The note's whole content: the claim, its source, and the passage quoted. */
export function renderClaimNote(note: ClaimNote): string {
    const lines = ["---", `claim: ${JSON.stringify(flat(note.claim))}`, "source:", `  - ${JSON.stringify(note.entry)}`, "---", ""];
    const passage = flat(note.passage);
    if (passage) lines.push(`> ${passage}`, "");
    return lines.join("\n");
}

/**
 * The claim an accepted *What's the claim* (#759) holds: its first line — what follows it is the
 * kind your provider named, never part of the sentence.
 */
export function acceptedClaim(thought: Pick<Thought, "text">): string {
    const first = thought.text.split("\n").find((line) => line.trim().length > 0) ?? "";
    return flat(first);
}

/**
 * What the sheet opens with (FR-2): the accepted *What's the claim* text when there is one, else the
 * selected words. Both are already yours. The title is the claim until you change it.
 */
export function claimDefaults(selected: string, accepted?: Pick<Thought, "text">): { claim: string; title: string } {
    const fromAccepted = accepted ? acceptedClaim(accepted) : "";
    const claim = fromAccepted || flat(selected);
    return { claim, title: claimTitle(claim) };
}

/** The title a claim suggests: the sentence itself, without its closing full stop. */
export function claimTitle(claim: string): string {
    return flat(claim).replace(/[.。]+$/, "");
}

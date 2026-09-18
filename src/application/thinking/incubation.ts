import type { Thought } from "./thought";

/**
 * Setting something aside (#469, epic #465) — pure.
 *
 * Some ideas should not be processed. Not developed, not linked, not classified, not turned into
 * a note, not resolved — just **left alone**, without that meaning abandoned.
 *
 * Every tool's answer to this is an inbox, and an inbox is a debt: a list that grows, counts
 * itself, and greets you with how far behind you are. That is the exact opposite of a refuge, and
 * it is why this is in phase 1 rather than later. Without it the Lab is another inbox.
 *
 * So the feature is mostly a **negative** one, and most of its weight is in a guardrail
 * (`test/application/thinking/noDebt.test.ts`) rather than in this file. What is here is small:
 * a state, a reason, and the one honest thing to say when you come back.
 */

/**
 * Why something is set aside. Two reasons, one state — *not now* and *I decided against this* are
 * different sentences about the same act, and both keep the thought.
 */
export type IncubationReason = "not-now" | "decided-against";

export interface Incubation {
    reason: IncubationReason;
    at: number;
    /** What you were trying to work out when you stopped. Optional, and usually the useful part. */
    stuckOn?: string;
}

/** Set a thought aside. It keeps everything it had; it simply stops being in front of you. */
export function setAside(
    thought: Thought,
    reason: IncubationReason,
    at: number,
    stuckOn?: string
): Thought {
    return {
        ...thought,
        incubated: { reason, at, ...(stuckOn?.trim() ? { stuckOn: stuckOn.trim() } : {}) },
    };
}

/** Pick it back up. Your move, never the system's. */
export function pickBackUp(thought: Thought): Thought {
    const { incubated: _incubated, ...rest } = thought;
    return rest;
}

export function isIncubated(thought: Thought): boolean {
    return thought.incubated !== undefined;
}

/** A note in the vault, reduced to what this module needs — so it stays Obsidian-free. */
export interface NoteFact {
    path: string;
    title: string;
    created: number;
}

/**
 * What has appeared in your vault since you set this down.
 *
 * Mechanical, and deliberately dull: notes created after that moment whose title shares a word
 * with what you were stuck on, **in the order they were created**. Not ranked, not scored, not
 * filtered by promise. "This appeared since" is a fact; "this is now worth your time" is a
 * judgement, and it is yours (§XII).
 */
export function appearedSince(
    notes: readonly NoteFact[],
    since: number,
    subject: string,
    limit = 5
): NoteFact[] {
    const words = subjectWords(subject);
    if (words.length === 0) return [];
    return notes
        .filter((note) => note.created > since)
        .filter((note) => {
            const title = note.title.toLowerCase();
            return words.some((word) => title.includes(word));
        })
        .sort((a, b) => a.created - b.created)
        .slice(0, limit);
}

/** The words worth matching on: long enough to mean something, lowercased, deduplicated. */
function subjectWords(subject: string): string[] {
    return [
        ...new Set(
            subject
                .toLowerCase()
                .split(/[^\p{L}\p{N}]+/u)
                .filter((word) => word.length >= 4)
        ),
    ];
}

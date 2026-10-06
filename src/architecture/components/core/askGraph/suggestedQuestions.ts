import type { t } from "architecture/lang";

type LocaleKey = Parameters<typeof t>[0];

/** A question Explore offers before you type anything (#696). */
export interface SuggestedQuestion {
    id: string;
    labelKey: LocaleKey;
    terms: string[];
}

/**
 * **The questions the graph's lenses used to be** (#696). The old 3D view hid seven of them behind a
 * gear — orphans, dead ends, contradictions, alone, frontier, bridges, gaps — where they could be
 * looked at and never asked, saved or narrowed. Here each is a question with its terms in plain view.
 *
 * Ordered by what most vaults have most of; `offer` drops the ones that would answer nothing in this
 * vault, the same rule a facet follows (#482): a choice that empties the selection is not a choice.
 */
export const SUGGESTED_QUESTIONS: readonly SuggestedQuestion[] = [
    { id: "unsourced-permanent", labelKey: "suggest_unsourced_permanent", terms: ["state:permanent", "unsourced"] },
    { id: "bridges", labelKey: "suggest_bridges", terms: ["bridge"] },
    { id: "contradictions", labelKey: "suggest_contradictions", terms: ["contradiction"] },
    { id: "orphans", labelKey: "suggest_orphans", terms: ["orphan"] },
    { id: "alone", labelKey: "suggest_alone", terms: ["alone"] },
    { id: "questions", labelKey: "suggest_questions", terms: ["relation:question"] },
    { id: "recent", labelKey: "suggest_recent", terms: ["newer-than:30"] },
    { id: "unsourced", labelKey: "suggest_unsourced", terms: ["unsourced"] },
];

/** At most this many: a row of choices, not a menu. */
export const SUGGESTED_MAX = 6;

/**
 * The suggestions worth offering: the ones that answer something, but not everything. When the
 * permanent-and-unsourced question answers, the plain unsourced one is a repeat and steps aside.
 */
export function offer(count: (terms: readonly string[]) => number, total: number): { question: SuggestedQuestion; count: number }[] {
    const out: { question: SuggestedQuestion; count: number }[] = [];
    for (const question of SUGGESTED_QUESTIONS) {
        if (out.length >= SUGGESTED_MAX) break;
        if (question.id === "unsourced" && out.some((each) => each.question.id === "unsourced-permanent")) continue;
        const n = count(question.terms);
        if (n === 0 || n === total) continue;
        out.push({ question, count: n });
    }
    return out;
}

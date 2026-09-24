import type { JudgementVerdict } from "architecture/knowledge/judgement";

/**
 * Asked again, before it shows you (#562, epic #558) — pure.
 *
 * A claim you can re-read is not the same thing as a claim you are **asked about**. Re-reading
 * tells you what you wrote; being asked tells you what you think now, and the difference between
 * the two is the only honest evidence of thinking anyone can show you.
 *
 * The moment that produces it is fragile: you have to answer **before** you see the old answer.
 * Read it first and your own answer is gone — you will agree with yourself and learn nothing. So
 * the rule here is the one #470 established for a question asked of the vault, and it is
 * structural rather than disciplinary: {@link claimReturnView} does not return the stored sentence
 * until an answer has been written, so a careless re-render has nothing to leak.
 */

/**
 * The three answers, which are **verdicts the record already has** (#336) rather than a new
 * vocabulary — so nothing has to be migrated and nothing has to be mapped.
 *
 * They are deliberately not merged with the four movements the blind panel records: a movement is
 * a self-report that writes nothing, and one of these is an act on a note. #576 (epic #574) owns
 * the question of whether the two ever become one thing.
 */
export const RETURN_ANSWERS = ["confirmed", "modified", "rejected"] as const satisfies readonly JudgementVerdict[];

export type ReturnAnswer = (typeof RETURN_ANSWERS)[number];

export function isReturnAnswer(value: unknown): value is ReturnAnswer {
    return typeof value === "string" && (RETURN_ANSWERS as readonly string[]).includes(value);
}

/** What each answer is called on screen. A literal map, so the locale guardrail (#320) can see it. */
export const RETURN_ANSWER_LABEL_KEY: Record<ReturnAnswer, string> = {
    confirmed: "claim_return_answer_confirmed",
    modified: "claim_return_answer_modified",
    rejected: "claim_return_answer_rejected",
};

export interface ClaimReturnState {
    path: string;
    /** What the note says today. **Never handed to the view until there is an answer.** */
    stored: string;
    /** Which claim is being asked about — the first, the only identity a claim set has. */
    claimIndex: number;
    /** How many the note says, so the view can say *this is one of several* without counting at you. */
    claimCount: number;
    /** Whether the evolution timeline is on. With it off you lose the history, not the loop. */
    historyKept: boolean;
    /** Undefined until you answer. Its absence is what defines the stage. */
    answer?: string;
    /** What you have typed so far, kept outside the DOM so leaving cannot cost it. */
    draft?: string;
}

export interface ClaimReturnView {
    path: string;
    answered: boolean;
    /**
     * What you said. Absent — not hidden — until you have answered.
     *
     * Named `said`/`says` rather than `then`/`now`: an object with a `then` is a **thenable**, and
     * one `await` on a view model would silently call it.
     */
    said?: string;
    /** What you say now. */
    says?: string;
    claimIndex: number;
    oneOfSeveral: boolean;
    historyKept: boolean;
    draft: string;
}

export function claimReturnView(state: ClaimReturnState): ClaimReturnView {
    const answered = typeof state.answer === "string" && state.answer.trim().length > 0;
    const common = {
        path: state.path,
        claimIndex: state.claimIndex,
        oneOfSeveral: state.claimCount > 1,
        historyKept: state.historyKept,
        draft: state.draft ?? "",
    };
    if (!answered) {
        // Not "hidden": absent. There is nothing here for a renderer to leak.
        return { ...common, answered: false };
    }
    return { ...common, answered: true, said: state.stored, says: state.answer };
}

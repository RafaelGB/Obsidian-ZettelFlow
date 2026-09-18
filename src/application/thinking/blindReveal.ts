/**
 * Think first, then look (#470, epic #465) — pure.
 *
 * When you ask your own vault a question it answers immediately, and the moment it does, your own
 * answer is gone. You will never know what you thought before you read it — and you will never
 * notice the thing worth noticing: that you had already worked this out two years ago and forgot.
 *
 * Every tool in this space optimises for *retrieving what you knew*. None of them preserve *what
 * you thought before you retrieved it*, which is the only way to watch your own reasoning move.
 *
 * This is the cheapest distinctive thing in the epic — the reveal half is the existing query,
 * unchanged, and your blind answer is just a thought. All that is added is **the wait**, and then
 * keeping both halves side by side.
 *
 * It offers no opinion about whether you were right. It has none (§XII), and there is deliberately
 * no tally, no accuracy and no streak: that would turn thinking into a game with a loser.
 */

/** What you say about yourself afterwards. Your words about your own mind, not a grade. */
export const MOVEMENTS = ["nothing", "forgotten", "wrong", "unchanged"] as const;
export type Movement = (typeof MOVEMENTS)[number];

export interface BlindAnswer {
    question: string;
    /** Exactly what you typed, stored before anything was revealed. */
    answer: string;
    at: number;
    /** The thought this answer was kept as. */
    thoughtId?: string;
}

/** What the vault held, reduced to what this module needs. */
export interface Revealed {
    path: string;
    title: string;
}

export interface BlindPair {
    question: string;
    /** What you thought. */
    thought: string;
    /** What you knew. Empty is a real and interesting answer. */
    knew: Revealed[];
    /** True when your vault had nothing — worth saying, not worth hiding. */
    knewNothing: boolean;
    at: number;
    /** What you said changed in you, once you looked. Absent until you say. */
    movement?: Movement;
}

/** Put the two halves together. The order is always yours first: you thought before you looked. */
export function pairFor(
    answer: BlindAnswer,
    revealed: readonly Revealed[],
    movement?: Movement
): BlindPair {
    return {
        question: answer.question,
        thought: answer.answer,
        knew: [...revealed],
        knewNothing: revealed.length === 0,
        at: answer.at,
        ...(movement ? { movement } : {}),
    };
}

/** Whether a string is one of the four things you can say. */
export function isMovement(value: string): value is Movement {
    return (MOVEMENTS as readonly string[]).includes(value);
}

/**
 * Every time you have asked this, oldest first — so you can read your positions in the order you
 * held them. Matching is on the question's exact text: two questions that differ are two
 * questions, and deciding they are "the same" would be an interpretation.
 */
export function historyFor(pairs: readonly BlindPair[], question: string): BlindPair[] {
    const needle = question.trim().toLowerCase();
    return pairs
        .filter((pair) => pair.question.trim().toLowerCase() === needle)
        .sort((a, b) => a.at - b.at);
}

/** The locale key for what you said about yourself. A map, never a composed key (#320). */
export const MOVEMENT_LABEL_KEY: Record<Movement, string> = {
    nothing: "blind_movement_nothing",
    forgotten: "blind_movement_forgotten",
    wrong: "blind_movement_wrong",
    unchanged: "blind_movement_unchanged",
};

/**
 * What the surface is allowed to draw, at each stage.
 *
 * The one requirement this whole feature exists for is that **nothing from your vault appears
 * before you answer**. A re-render that leaked it would break the feature silently, and a source
 * scan would not catch it.
 *
 * So the leak is made impossible rather than forbidden: before you submit, `knew` is not merely
 * hidden — it is **absent from the view model**, so the renderer has nothing to draw even if it
 * tried. The renderer reads only what this returns.
 */
export type BlindStage = "asking" | "revealed";

export interface BlindView {
    stage: BlindStage;
    question: string;
    /** Your answer, once you have given one. */
    thought?: string;
    /** What the vault held. **Always empty while the stage is `asking`.** */
    knew: Revealed[];
    knewNothing: boolean;
    movement?: Movement;
}

export interface BlindState {
    question: string;
    /** Undefined until you submit. Its absence is what defines the stage. */
    answer?: string;
    /** What the query returned. Ignored entirely while there is no answer. */
    revealed?: readonly Revealed[];
    movement?: Movement;
}

export function blindView(state: BlindState): BlindView {
    const answered = typeof state.answer === "string" && state.answer.trim().length > 0;
    if (!answered) {
        // Not "hidden": absent. There is nothing here for a renderer to leak.
        return { stage: "asking", question: state.question, knew: [], knewNothing: false };
    }
    const revealed = state.revealed ?? [];
    return {
        stage: "revealed",
        question: state.question,
        thought: state.answer,
        knew: [...revealed],
        knewNothing: revealed.length === 0,
        ...(state.movement ? { movement: state.movement } : {}),
    };
}

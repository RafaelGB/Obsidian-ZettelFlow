/**
 * **Thinking moves by your AI provider** (#759, epic #741) — the pure half: the six moves, what each
 * asks, and what is kept of what comes back.
 *
 * A move is one question asked of one passage, on a click: *Why?*, *Challenge*, *Question*, *What's
 * the claim*, *Reflect*, *Explain*. Its prompt holds the move's task, the selected words, the
 * paragraph they sit in and the one before it, and the book's and chapter's titles — **nothing from
 * your vault**, by construction: {@link ReaderMoveInput} has no field for a note, a highlight or a
 * thought (FR-4, AC-1). The content is capped by the AI input limit and delimited as data (#301);
 * the answer is cleaned and bounded before it is shown (AC-3).
 *
 * The prompts are public (FR-5): each `task` is quoted word for word in `docs/development/reader.md`,
 * and a docs test keeps the page and the code the same.
 *
 * Each move logs under a verb of the existing vocabulary (#489) — never a twelfth verb (FR-8). The
 * primitive is not stored here: it is the verb's own, read from `MOVE_VERBS` (AC-10).
 */

import { capText } from "architecture/ai/aiGate";
import { delimitContent, sanitizeAiText } from "architecture/ai/promptSafety";
import { MOVE_VERBS, type MovePrimitive, type MoveVerbId } from "./move";
import type { ReaderMoveId } from "./thought";

export type ReaderAiMoveId = Extract<ReaderMoveId, "why" | "challenge" | "question" | "claim" | "reflect" | "explain">;

/** One move: what it asks, how long its answer may be, and what it logs. */
export interface ReaderAiMove {
    id: ReaderAiMoveId;
    /** The verb of #489 it is logged under (FR-8). */
    verb: MoveVerbId;
    /** How an accepted answer threads under a highlight (FR-7): *Challenge* as a challenge, the rest as forks. */
    thread: "challenge" | "fork";
    /** At most this many sentences are kept (FR-1). */
    sentences: number;
    /** The task, fixed in code and quoted in the docs (FR-5). */
    task: string;
}

/** The six, in the order of the *Think* row (FR-1's table). */
export const READER_AI_MOVES: readonly ReaderAiMove[] = [
    {
        id: "why",
        verb: "reframe",
        thread: "fork",
        sentences: 4,
        task: "Explain, in one short paragraph, the author's reasoning for the selected words, using only the passage given. Do not summarise the book.",
    },
    {
        id: "challenge",
        verb: "challenge",
        thread: "challenge",
        sentences: 2,
        task: "Name the one assumption the selected words rest on, and say why it might not hold. Use only the passage given.",
    },
    {
        id: "question",
        verb: "branch",
        thread: "fork",
        sentences: 1,
        task: "Ask the one question about the selected words that is most worth investigating. Reply with the question only.",
    },
    {
        id: "claim",
        verb: "compress",
        thread: "fork",
        sentences: 1,
        task: 'State exactly what the selected words claim, in one sentence, and the kind of claim it is. Reply in two lines: "Claim: <the claim>" and "Kind: <causal, general, normative, descriptive or predictive>", keeping the words Claim and Kind in English.',
    },
    {
        id: "reflect",
        verb: "branch",
        thread: "fork",
        sentences: 4,
        task: "Say what follows if the selected words are true: one consequence, in a few sentences, ending with a question to the reader.",
    },
    {
        id: "explain",
        verb: "reframe",
        thread: "fork",
        sentences: 4,
        task: "Explain what the selected words mean here, in this passage and its context, in one short paragraph. Do not give a dictionary definition.",
    },
];

/** The move, by its id. */
export function readerAiMove(id: ReaderAiMoveId): ReaderAiMove {
    const move = READER_AI_MOVES.find((entry) => entry.id === id);
    if (!move) throw new Error(`unknown reader move ${id}`);
    return move;
}

/** The primitive a move logs under: its verb's own (AC-10). */
export function primitiveOf(move: ReaderAiMove): MovePrimitive {
    const verb = MOVE_VERBS.find((entry) => entry.verb === move.verb);
    if (!verb) throw new Error(`unknown verb ${move.verb}`);
    return verb.primitive;
}

/** What a move sends — and, by its shape, all it can send (FR-4). */
export interface ReaderMoveInput {
    selected: string;
    paragraph: string;
    previous: string;
    bookTitle: string;
    chapterTitle: string;
}

/** The longest answer shown, in characters, cut at a sentence end. */
export const READER_AI_ANSWER_MAX = 600;

/** Your Obsidian language, named in English for the model ("Spanish"), so every model reads it (G2). */
export function languageName(tag: string): string {
    try {
        const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag || "en");
        return name && name !== tag ? name : "English";
    } catch {
        return "English";
    }
}

/**
 * The prompt for one move on one passage (AC-1): the task, the language and the length it is asked
 * in, then the passage, its paragraphs and the two titles — capped at the input limit and delimited
 * as untrusted content. The system guard is sent by the provider.
 */
export function buildReaderMovePrompt(move: ReaderAiMove, input: ReaderMoveInput, options: { maxChars: number; language: string }): string {
    const n = move.sentences;
    const ask = `Answer in ${languageName(options.language)}, in at most ${n} ${n === 1 ? "sentence" : "sentences"}, with no preamble.`;
    const flat = (text: string) => text.replace(/\s+/g, " ").trim();
    const content = [
        `Book: ${flat(input.bookTitle)}`,
        `Chapter: ${flat(input.chapterTitle)}`,
        `Previous paragraph: ${flat(input.previous)}`,
        `Paragraph: ${flat(input.paragraph)}`,
        `Selected: ${flat(input.selected)}`,
    ].join("\n");
    const room = Math.max(200, options.maxChars - move.task.length - ask.length);
    return `${move.task}\n${ask}\n\n${delimitContent(capText(content, room))}`;
}

/** The sentences of a text, each with its end. */
function sentencesOf(text: string): string[] {
    return text.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
}

/**
 * The answer, as shown (AC-3): template tokens neutralised; headings, list markers, emphasis and a
 * leading "Answer:" taken off; one paragraph; the move's sentences at most; and no more than
 * {@link READER_AI_ANSWER_MAX} characters, cut where a sentence ends.
 */
export function cleanAnswer(raw: string, move: Pick<ReaderAiMove, "sentences">): string {
    const lines = sanitizeAiText(raw, 8_000)
        .replace(/```\w*/g, "")
        .split(/\n+/)
        // A heading is a title the model gave its answer, not the answer.
        .filter((line) => !/^\s*#{1,6}\s/.test(line))
        .map((line) =>
            line
                .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "")
                .replace(/\*\*|__/g, "")
                .trim()
        )
        .filter(Boolean);
    const text = lines.join(" ").replace(/^(?:answer|respuesta)\s*:\s*/i, "").trim();
    const kept = sentencesOf(text).slice(0, Math.max(1, move.sentences)).join(" ");
    if (kept.length <= READER_AI_ANSWER_MAX) return kept;
    const cut = kept.slice(0, READER_AI_ANSWER_MAX);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    return end > 0 ? cut.slice(0, end + 1) : `${cut.slice(0, READER_AI_ANSWER_MAX - 1).trimEnd()}…`;
}

export const CLAIM_KINDS = ["causal", "general", "normative", "descriptive", "predictive"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/**
 * *What's the claim*, read: `Claim: … / Kind: …`. An unknown kind is dropped and the claim kept; an
 * answer that ignored the shape is the claim as a whole.
 */
export function parseClaimAnswer(raw: string): { claim: string; kind?: ClaimKind } {
    const text = sanitizeAiText(raw, 8_000);
    const kindMatch = text.match(/^\s*[*_]*kind[*_]*\s*:\s*[*_]*\s*([a-zA-Z]+)/im);
    const kind = kindMatch ? (kindMatch[1].toLowerCase() as ClaimKind) : undefined;
    const claimMatch = text.match(/^\s*[*_]*claim[*_]*\s*:\s*(.+)$/im);
    const body = claimMatch ? claimMatch[1] : text.replace(/^\s*[*_]*kind[*_]*\s*:.*$/gim, "");
    const claim = cleanAnswer(body, { sentences: 1 });
    return { claim, ...(kind && (CLAIM_KINDS as readonly string[]).includes(kind) ? { kind } : {}) };
}

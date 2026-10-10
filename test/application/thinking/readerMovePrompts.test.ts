import { describe, it, expect } from "@jest/globals";
import {
    READER_AI_MOVES,
    READER_AI_ANSWER_MAX,
    buildReaderMovePrompt,
    cleanAnswer,
    languageName,
    parseClaimAnswer,
    primitiveOf,
    readerAiMove,
    type ReaderMoveInput,
} from "application/thinking/readerMovePrompts";
import { MOVE_VERBS } from "application/thinking/move";
import { READER_MOVES } from "application/thinking/thought";

/**
 * **Thinking moves by your AI provider: the prompts** (#759 AC-1, AC-3, AC-10). What is asked is
 * the whole privacy story, so each prompt is pinned whole.
 */

const INPUT: ReaderMoveInput = {
    selected: "the planning fallacy",
    paragraph: "This is the planning fallacy, or the planning bias as some call it.",
    previous: "Forecasts were too optimistic in every case.",
    bookTitle: "Thinking, Fast and Slow",
    chapterTitle: "Ch. 23 · The outside view",
};
const OPTIONS = { maxChars: 12_000, language: "es" };

describe("six moves, one prompt each (#759 FR-1, FR-4, FR-5, AC-1)", () => {
    it("holds the six in the Think row's order, each one of the Reader's moves", () => {
        expect(READER_AI_MOVES.map((m) => m.id)).toEqual(["why", "challenge", "question", "claim", "reflect", "explain"]);
        for (const move of READER_AI_MOVES) expect(READER_MOVES).toContain(move.id);
    });

    it.each(READER_AI_MOVES.map((m) => [m.id]))("%s: the task, the language and length, and five labelled fields, nothing else", (id) => {
        const move = readerAiMove(id as never);
        const prompt = buildReaderMovePrompt(move, INPUT, OPTIONS);
        const n = move.sentences;
        expect(prompt).toBe(
            `${move.task}\nAnswer in Spanish, in at most ${n} ${n === 1 ? "sentence" : "sentences"}, with no preamble.\n\n` +
                "<note-content>\n" +
                "Book: Thinking, Fast and Slow\n" +
                "Chapter: Ch. 23 · The outside view\n" +
                "Previous paragraph: Forecasts were too optimistic in every case.\n" +
                "Paragraph: This is the planning fallacy, or the planning bias as some call it.\n" +
                "Selected: the planning fallacy\n" +
                "</note-content>"
        );
    });

    it("pins each task, word for word, as the docs quote it", () => {
        expect(Object.fromEntries(READER_AI_MOVES.map((m) => [m.id, m.task]))).toMatchInlineSnapshot(`
{
  "challenge": "Name the one assumption the selected words rest on, and say why it might not hold. Use only the passage given.",
  "claim": "State exactly what the selected words claim, in one sentence, and the kind of claim it is. Reply in two lines: "Claim: <the claim>" and "Kind: <causal, general, normative, descriptive or predictive>", keeping the words Claim and Kind in English.",
  "explain": "Explain what the selected words mean here, in this passage and its context, in one short paragraph. Do not give a dictionary definition.",
  "question": "Ask the one question about the selected words that is most worth investigating. Reply with the question only.",
  "reflect": "Say what follows if the selected words are true: one consequence, in a few sentences, ending with a question to the reader.",
  "why": "Explain, in one short paragraph, the author's reasoning for the selected words, using only the passage given. Do not summarise the book.",
}
`);
    });

    it("cuts a huge passage at the input limit, with the visible marker", () => {
        const prompt = buildReaderMovePrompt(readerAiMove("why"), { ...INPUT, paragraph: "word ".repeat(4_000) }, { maxChars: 1_000, language: "en" });
        expect(prompt).toContain("[…truncated by ZettelFlow to fit the AI input limit]");
        expect(prompt.length).toBeLessThan(1_200);
        expect(prompt.endsWith("</note-content>")).toBe(true);
    });

    it("has no field for the vault: a note cannot be passed", () => {
        // @ts-expect-error — the input has no place for your notes (FR-4).
        const prompt = buildReaderMovePrompt(readerAiMove("why"), { ...INPUT, notes: ["Notes/Secret.md"] }, OPTIONS);
        expect(prompt).not.toContain("Secret");
    });

    it("asks in your Obsidian language, named in English for the model", () => {
        expect(languageName("es")).toBe("Spanish");
        expect(languageName("en")).toBe("English");
        expect(languageName("")).toBe("English");
        expect(buildReaderMovePrompt(readerAiMove("why"), INPUT, { maxChars: 12_000, language: "en" })).toContain("Answer in English, in at most 4 sentences");
    });
});

describe("the answer, cleaned and bounded (#759 AC-3)", () => {
    it("neutralises template tokens", () => {
        expect(cleanAnswer("It inserts {{title}} here.", { sentences: 4 })).not.toContain("{{");
    });

    it("takes off headings, list markers, emphasis and a leading Answer:", () => {
        expect(cleanAnswer("## Answer\n- **The author** argues from cases.\n2. Base rates matter.", { sentences: 4 })).toBe("The author argues from cases. Base rates matter.");
        expect(cleanAnswer("Answer: Because forecasts ignore base rates.", { sentences: 4 })).toBe("Because forecasts ignore base rates.");
    });

    it("keeps the move's sentences at most", () => {
        const raw = "One. Two? Three! Four. Five.";
        expect(cleanAnswer(raw, readerAiMove("question"))).toBe("One.");
        expect(cleanAnswer(raw, readerAiMove("challenge"))).toBe("One. Two?");
        expect(cleanAnswer(raw, readerAiMove("why"))).toBe("One. Two? Three! Four.");
    });

    it("cuts at 600 characters, where a sentence ends", () => {
        const long = `${"a".repeat(400)}. ${"b".repeat(400)}.`;
        const out = cleanAnswer(long, { sentences: 4 });
        expect(out).toBe(`${"a".repeat(400)}.`);
        const unbroken = cleanAnswer("c".repeat(900), { sentences: 4 });
        expect(unbroken.length).toBe(READER_AI_ANSWER_MAX);
        expect(unbroken.endsWith("…")).toBe(true);
    });

    it("reads What's the claim: the claim and its kind; an unknown kind dropped, the claim kept", () => {
        expect(parseClaimAnswer("Claim: Plans ignore base rates.\nKind: causal")).toEqual({ claim: "Plans ignore base rates.", kind: "causal" });
        expect(parseClaimAnswer("**Claim:** Plans fail.\n**Kind:** Normative")).toEqual({ claim: "Plans fail.", kind: "normative" });
        expect(parseClaimAnswer("Claim: Plans fail.\nKind: poetic")).toEqual({ claim: "Plans fail." });
        expect(parseClaimAnswer("Plans fail. And more.")).toEqual({ claim: "Plans fail." });
    });
});

describe("the verbs of #489, never a twelfth (#759 FR-8, AC-10)", () => {
    it("logs each move under the owner's verb, and the primitive that verb belongs to", () => {
        const byVerb = new Map(MOVE_VERBS.map((v) => [v.verb, v.primitive]));
        expect(Object.fromEntries(READER_AI_MOVES.map((m) => [m.id, [m.verb, primitiveOf(m)]]))).toEqual({
            why: ["reframe", "transform"],
            challenge: ["challenge", "perturb"],
            question: ["branch", "explore"],
            claim: ["compress", "transform"],
            reflect: ["branch", "explore"],
            explain: ["reframe", "transform"],
        });
        for (const move of READER_AI_MOVES) expect(byVerb.get(move.verb)).toBe(primitiveOf(move));
    });

    it("threads Challenge as a challenge, the other five as forks (FR-7)", () => {
        expect(READER_AI_MOVES.filter((m) => m.thread === "challenge").map((m) => m.id)).toEqual(["challenge"]);
    });
});

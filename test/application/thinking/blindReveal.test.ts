import { describe, it, expect } from "@jest/globals";
import {
    blindView,
    historyFor,
    isMovement,
    MOVEMENTS,
    MOVEMENT_LABEL_KEY,
    pairFor,
    type BlindAnswer,
    type BlindPair,
} from "application/thinking/blindReveal";

const NOW = 1_700_000_000_000;

const answer: BlindAnswer = {
    question: "Should we use Kafka here?",
    answer: "I don't think so — the volume doesn't justify the complexity.",
    at: NOW,
};

describe("what you thought, and what you knew (#470)", () => {
    it("keeps your answer exactly as you typed it, alongside what the vault held", () => {
        const pair = pairFor(answer, [{ path: "decisions/queues.md", title: "Why we dropped queues" }]);
        expect(pair.thought).toBe(answer.answer);
        expect(pair.knew).toEqual([{ path: "decisions/queues.md", title: "Why we dropped queues" }]);
        expect(pair.knewNothing).toBe(false);
    });

    it("says plainly when your vault held nothing, instead of hiding an empty half", () => {
        // "You had never written about this" is a real answer, and often the interesting one.
        const pair = pairFor(answer, []);
        expect(pair.knewNothing).toBe(true);
        expect(pair.knew).toEqual([]);
    });

    it("has no movement until you say one", () => {
        expect(pairFor(answer, []).movement).toBeUndefined();
        expect(pairFor(answer, [], "forgotten").movement).toBe("forgotten");
    });

    it("offers four things to say about yourself, and only four", () => {
        expect([...MOVEMENTS]).toEqual(["nothing", "forgotten", "wrong", "unchanged"]);
        expect(isMovement("forgotten")).toBe(true);
        expect(isMovement("correct")).toBe(false);
        expect(isMovement("")).toBe(false);
    });

    it("has a label key for each, as a map rather than a composed key", () => {
        for (const movement of MOVEMENTS) expect(MOVEMENT_LABEL_KEY[movement]).toBeTruthy();
        expect(Object.keys(MOVEMENT_LABEL_KEY).sort()).toEqual([...MOVEMENTS].sort());
    });

    it("carries no score, accuracy or verdict about whether you were right", () => {
        const pair = pairFor(answer, [], "wrong");
        for (const grading of ["score", "correct", "accuracy", "right"]) {
            expect(Object.keys(pair)).not.toContain(grading);
        }
    });
});

describe("reading your positions in the order you held them (#470)", () => {
    const pairs: BlindPair[] = [
        pairFor({ ...answer, at: NOW + 200 }, [], "unchanged"),
        pairFor({ ...answer, at: NOW }, [], "forgotten"),
        pairFor({ question: "Something else?", answer: "no", at: NOW + 100 }, []),
    ];

    it("keeps every time you asked the same thing, oldest first", () => {
        const history = historyFor(pairs, "Should we use Kafka here?");
        expect(history.map((pair) => pair.movement)).toEqual(["forgotten", "unchanged"]);
    });

    it("matches a question regardless of spacing and case", () => {
        expect(historyFor(pairs, "  should we use kafka HERE?  ")).toHaveLength(2);
    });

    it("treats a different question as a different question", () => {
        // Deciding two differently-worded questions are "the same" would be an interpretation,
        // and this module does not make any.
        expect(historyFor(pairs, "Should we use Kafka?")).toEqual([]);
    });

    it("says nothing when you have never asked it", () => {
        expect(historyFor([], "anything")).toEqual([]);
    });
});

describe("nothing from the vault exists before you answer (#470)", () => {
    const revealed = [{ path: "decisions/queues.md", title: "Why we dropped queues" }];

    it("gives the renderer nothing to leak while it is still asking", () => {
        // Not hidden — absent. A careless re-render cannot show what is not in the view model.
        const view = blindView({ question: "Kafka?", revealed });
        expect(view.stage).toBe("asking");
        expect(view.knew).toEqual([]);
        expect(view.thought).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain("queues");
    });

    it("stays asking when the answer is only whitespace", () => {
        expect(blindView({ question: "Kafka?", answer: "   ", revealed }).knew).toEqual([]);
    });

    it("shows both halves once you have answered", () => {
        const view = blindView({ question: "Kafka?", answer: "probably not", revealed });
        expect(view.stage).toBe("revealed");
        expect(view.thought).toBe("probably not");
        expect(view.knew).toEqual(revealed);
    });

    it("says your vault held nothing, rather than showing an empty space", () => {
        const view = blindView({ question: "Kafka?", answer: "probably not" });
        expect(view.knewNothing).toBe(true);
    });

    it("carries the movement once you have said one", () => {
        const view = blindView({ question: "Kafka?", answer: "no", revealed, movement: "forgotten" });
        expect(view.movement).toBe("forgotten");
    });
});

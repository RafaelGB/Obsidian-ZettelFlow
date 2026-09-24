import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { claimReturnView, type ClaimReturnState } from "application/claims";
import { answerReturn, observeWager, type ReturnWriter } from "architecture/plugin/claims/answerReturn";
import type { Judgement } from "architecture/knowledge/judgement";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function code(source: string): string {
    return source
        .split(String.fromCharCode(10))
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(String.fromCharCode(10));
}

const SENTINEL = "SENTINEL-EXPECTATION-DO-NOT-LEAK";
const PATH = "Notes/microservices.md";

function state(over: Partial<ClaimReturnState> = {}): ClaimReturnState {
    return {
        path: PATH,
        stored: "microservices move complexity",
        claimIndex: 0,
        claimCount: 1,
        historyKept: true,
        wager: { expectation: SENTINEL, at: 1_700_000_000_000 },
        ...over,
    };
}

function writer(): ReturnWriter & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        async writeClaim(_path, sentence, alsoClearWager) {
            calls.push(`writeClaim:${sentence}:${alsoClearWager === true}`);
            return true;
        },
        async removeClaimAt(_path, index, alsoClearWager) {
            calls.push(`removeClaimAt:${index}:${alsoClearWager === true}`);
            return true;
        },
        async writeThought(text, about) {
            calls.push(`writeThought:${text}:${about}`);
            return true;
        },
        async clearWager() {
            calls.push("clearWager");
            return true;
        },
        record(entry: Omit<Judgement, "at">) {
            calls.push(`record:${entry.verdict}`);
        },
    };
}

/**
 * What actually happened, asked blind (#571, epic #560).
 *
 * The order is the whole feature. Read what you predicted before writing what you saw and the
 * prediction confirms itself — so the expectation is **absent** from the view model, not hidden,
 * until an observation exists.
 */
describe("the prediction stays shut until you have answered (#571)", () => {
    it("leaks nothing at all while it asks what happened", () => {
        const view = claimReturnView(state());
        expect(view.asksObservation).toBe(true);
        expect("expected" in view).toBe(false);
        expect(JSON.stringify(view)).not.toContain(SENTINEL);
    });

    it("treats a whitespace-only observation as no observation", () => {
        expect(JSON.stringify(claimReturnView(state({ observation: "   " })))).not.toContain(SENTINEL);
    });

    it("shows both once you have written what happened", () => {
        const view = claimReturnView(state({ observation: "they still waited on each other" }));
        expect(view.asksObservation).toBe(false);
        expect(view.expected).toBe(SENTINEL);
        expect(view.happened).toBe("they still waited on each other");
    });

    it("carries no verdict about the prediction", () => {
        const view = claimReturnView(state({ observation: "it happened" }));
        for (const forbidden of ["correct", "accurate", "hit", "right", "score", "match"]) {
            expect({ forbidden, present: forbidden in view }).toEqual({ forbidden, present: false });
        }
    });

    it("asks for a new sentence only when it is resolving a wager", () => {
        expect(claimReturnView(state()).needsSentence).toBe(true);
        expect(claimReturnView(state({ wager: undefined })).needsSentence).toBe(false);
        // And an ordinary return is untouched by all of this.
        expect(claimReturnView(state({ wager: undefined })).asksObservation).toBe(false);
    });
});

/**
 * The observation is one thought, and nothing else (#571 FR-4).
 */
describe("what happened is written down, and only that (#571)", () => {
    it("writes one thought about the note", async () => {
        const effects = writer();
        expect(await observeWager(PATH, "they still waited", effects)).toBe(true);
        expect(effects.calls).toEqual([`writeThought:they still waited:${PATH}`]);
    });

    it("writes nothing for a blank observation", async () => {
        const effects = writer();
        expect(await observeWager(PATH, "   ", effects)).toBe(false);
        expect(effects.calls).toEqual([]);
    });

    it("says so when the thinking space cannot take it", async () => {
        const effects = writer();
        const refusing: ReturnWriter = { ...effects, writeThought: async () => false };
        expect(await observeWager(PATH, "something", refusing)).toBe(false);
    });
});

/**
 * Resolving clears the horizon, in the same write (#571 FR-6).
 *
 * And it moves a shipped invariant: *it still says this* wrote nothing, because agreeing with
 * yourself is not an edit. With a horizon to clear it must now write, or the wager comes due for
 * ever.
 */
describe("a resolved wager stops being due (#571)", () => {
    const request = { path: PATH, stored: "the claim", claimIndex: 0, origin: "derived" as const };

    it("clears the horizon for it still says this", async () => {
        const effects = writer();
        expect(await answerReturn({ ...request, answer: "confirmed", clearHorizon: true }, effects)).toBe(true);
        expect(effects.calls).toEqual(["clearWager", "record:confirmed"]);
    });

    it("still writes nothing when there is no horizon to clear", async () => {
        const effects = writer();
        await answerReturn({ ...request, answer: "confirmed" }, effects);
        expect(effects.calls).toEqual(["record:confirmed"]);
    });

    it("takes the horizon off in the same write as the new sentence", async () => {
        const effects = writer();
        await answerReturn({ ...request, answer: "modified", sentence: "it moves it", clearHorizon: true }, effects);
        expect(effects.calls).toEqual(["writeClaim:it moves it:true", "record:modified"]);
    });

    it("and in the same write as the withdrawal, after the sentence survives", async () => {
        const effects = writer();
        await answerReturn({ ...request, answer: "rejected", clearHorizon: true }, effects);
        expect(effects.calls).toEqual([
            `writeThought:the claim:${PATH}`,
            "removeClaimAt:0:true",
            "record:rejected",
        ]);
    });

    it("stops at the first refusal", async () => {
        const effects = writer();
        const refusing: ReturnWriter = { ...effects, clearWager: async () => false };
        expect(await answerReturn({ ...request, answer: "confirmed", clearHorizon: true }, refusing)).toBe(false);
        expect(effects.calls).toEqual([]);
    });
});

/**
 * Nothing compares the two sentences (#571 FR-9, and the epic's central refusal).
 *
 * No accuracy, no hit rate, no calibration, no *correct*. The two sentences sit side by side and
 * that is the entire feedback — nobody needs to be told which one they wrote.
 */
describe("nothing in the code decides whether you were right (#571)", () => {
    const FILES = [
        "src/application/claims/claimReturn.ts",
        "src/architecture/plugin/claims/answerReturn.ts",
        "src/architecture/plugin/claims/wagersOf.ts",
        "src/architecture/knowledge/review/dueClaims.ts",
        "src/architecture/components/core/claims/ClaimReturnModal.ts",
    ];

    it("names no scoring vocabulary anywhere in the path", () => {
        for (const file of FILES) {
            const body = code(read(file));
            for (const word of ["accuracy", "correct", "calibrat", "hitRate", "wasRight", "score"]) {
                expect({ file, word, found: body.includes(word) }).toEqual({ file, word, found: false });
            }
        }
    });

    it("never puts the expectation and the observation on the same line", () => {
        // The comparison would have to be written somewhere, and this is where it would go.
        for (const file of FILES) {
            const offenders = code(read(file))
                .split(String.fromCharCode(10))
                .filter((line) => /expect(ation|ed)/.test(line) && /observation|happened/.test(line))
                .filter((line) => /[=!]==|includes\(|match\(|localeCompare/.test(line));
            expect({ file, offenders }).toEqual({ file, offenders: [] });
        }
    });

    it("keeps three answers, not four", () => {
        const modal = code(read("src/architecture/components/core/claims/ClaimReturnModal.ts"));
        expect(modal).not.toContain("was right");
        expect(modal).toContain("RETURN_ANSWERS");
        expect(modal).not.toContain("innerHTML");
        expect(modal).not.toContain("el.style.");
    });

    it("asks the new sentence before it commits one", () => {
        const modal = code(read("src/architecture/components/core/claims/ClaimReturnModal.ts"));
        expect(modal).toContain("view.needsSentence");
    });
});

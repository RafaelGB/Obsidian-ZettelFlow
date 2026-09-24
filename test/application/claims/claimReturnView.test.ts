import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    RETURN_ANSWERS,
    RETURN_ANSWER_LABEL_KEY,
    isReturnAnswer,
    claimReturnView,
    type ClaimReturnState,
} from "application/claims";
import { JUDGEMENT_VERDICTS } from "architecture/knowledge/judgement";
import { MOVEMENTS } from "application/thinking/blindReveal";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const RETURN = readFileSync(join(ROOT, "src/application/claims/claimReturn.ts"), "utf8");

const SENTINEL = "SENTINEL-CLAIM-DO-NOT-LEAK";

function state(over: Partial<ClaimReturnState> = {}): ClaimReturnState {
    return {
        path: "Notes/a.md",
        stored: SENTINEL,
        claimIndex: 0,
        claimCount: 1,
        historyKept: true,
        ...over,
    };
}

/**
 * The three answers are verdicts the record already has (#562, epic #558).
 *
 * The blind panel asks *what changed in you?* and records four **movements**; this asks the same
 * question about a different subject and records a **verdict on a note**. #576 (epic #574) owns the
 * decision about whether they become one vocabulary — so until it lands, the guard here is that
 * nobody quietly ships the second copy.
 */
describe("the return's answers are the record's own verdicts (#562)", () => {
    it("is a closed set of three, all of them judgement verdicts", () => {
        expect(RETURN_ANSWERS).toEqual(["confirmed", "modified", "rejected"]);
        for (const answer of RETURN_ANSWERS) expect(JUDGEMENT_VERDICTS).toContain(answer);
        expect(isReturnAnswer("confirmed")).toBe(true);
        expect(isReturnAnswer("challenged")).toBe(false);
    });

    it("names each answer from the locale layer, literally", () => {
        for (const answer of RETURN_ANSWERS) {
            expect(RETURN_ANSWER_LABEL_KEY[answer]).toMatch(/^claim_return_answer_/);
            expect(RETURN).toContain(`"${RETURN_ANSWER_LABEL_KEY[answer]}"`);
        }
    });

    it("does not become a second copy of the blind panel's movements (#576)", () => {
        for (const movement of MOVEMENTS) {
            expect(RETURN_ANSWERS as readonly string[]).not.toContain(movement);
        }
        expect(RETURN).not.toContain("blindReveal");
    });
});

/**
 * It asks before it shows (#470's rule, on a claim).
 *
 * Structural, not disciplinary: the stored sentence is **absent** from the view model until an
 * answer is written, so a careless re-render has nothing to leak.
 */
describe("the claim is absent until you have answered (#562)", () => {
    it("leaks nothing at all while it is asking", () => {
        const view = claimReturnView(state());
        expect(view.answered).toBe(false);
        expect(view.said).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain(SENTINEL);
    });

    it("treats a whitespace-only answer as no answer", () => {
        const view = claimReturnView(state({ answer: "   " }));
        expect(view.answered).toBe(false);
        expect(JSON.stringify(view)).not.toContain(SENTINEL);
    });

    it("shows both sentences once you have answered", () => {
        const view = claimReturnView(state({ answer: "I think something else now" }));
        expect(view.answered).toBe(true);
        expect(view.said).toBe(SENTINEL);
        expect(view.says).toBe("I think something else now");
    });

    it("says which claim it is asking about when a note says several things", () => {
        const many = claimReturnView(state({ claimCount: 3 }));
        expect(many.claimIndex).toBe(0);
        expect(many.oneOfSeveral).toBe(true);
        expect(claimReturnView(state()).oneOfSeveral).toBe(false);
    });

    it("says what the claim cites, in both stages, and never asks for one (#582)", () => {
        const cites = ["[[Team topologies]]"];
        expect(claimReturnView(state({ cites })).cites).toEqual(cites);
        const answered = claimReturnView(state({ cites, answer: "something else" }));
        expect(answered.cites).toEqual(cites);
        // And the promise of #562 is untouched by it.
        expect(claimReturnView(state({ cites })).said).toBeUndefined();
        expect(claimReturnView(state()).cites).toEqual([]);
        expect(RETURN).not.toContain("applySource");
    });

    it("carries the draft, and says whether the history is being kept", () => {
        expect(claimReturnView(state({ draft: "half a sentence" })).draft).toBe("half a sentence");
        expect(claimReturnView(state()).draft).toBe("");
        expect(claimReturnView(state({ historyKept: false })).historyKept).toBe(false);
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    criticalThinkingPrompts,
    UNIVERSAL_PROMPT_TOKENS,
    GAP_PROMPT_TOKENS,
} from "actions/thinkingSimulator/thinkingSimulatorLogic";
import { idea, buildModel } from "./support/knowledgeFixture";

// A fully-challenged note: a sourced claim, a `contradicts` partner, an `example`, an incoming edge
// (inDegree>0) and an open `question`. Every gap precondition fails ⇒ only the universal prompts.
function fullyChallenged() {
    return buildModel([
        idea(
            "done.md",
            "permanent",
            [
                { to: "c.md", type: "contradicts" },
                { to: "e.md", type: "example" },
                { to: "q.md", type: "question" },
            ],
            { hasSources: true, claims: [{ text: "c", sources: [{ ref: "src", kind: "text" }] }] }
        ),
        idea("in.md", "permanent", [{ to: "done.md" }]),
    ]);
}

describe("criticalThinkingPrompts (#165, FR-2..FR-5, AC-1, AC-3)", () => {
    it("returns exactly the four universal prompts, in order, for a fully-challenged note", () => {
        expect(criticalThinkingPrompts(fullyChallenged(), "done.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS]);
        expect(UNIVERSAL_PROMPT_TOKENS.length).toBe(4);
    });

    it("returns universals then every gap token, in the fixed order, for a maximally-gappy note", () => {
        // gap.md: fleeting, an unsourced claim, no contradicts/example/question edge, no incoming edge.
        const model = buildModel([idea("gap.md", "fleeting", [], { claims: [{ text: "raw" }] })]);
        expect(criticalThinkingPrompts(model, "gap.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS, ...GAP_PROMPT_TOKENS]);
    });

    it("always emits the four universals first — needs-evidence follows them", () => {
        const model = buildModel([idea("gap.md", "fleeting", [], { claims: [{ text: "raw" }] })]);
        const prompts = criticalThinkingPrompts(model, "gap.md");
        expect(prompts.slice(0, 4)).toEqual([...UNIVERSAL_PROMPT_TOKENS]);
        expect(prompts[4]).toBe("needs-evidence");
    });

    it("adds needs-evidence in isolation for an unsourced claim", () => {
        const model = buildModel([
            idea(
                "n.md",
                "permanent",
                [
                    { to: "c.md", type: "contradicts" },
                    { to: "e.md", type: "example" },
                    { to: "q.md", type: "question" },
                ],
                { hasSources: false, claims: [{ text: "c" }] }
            ),
            idea("in.md", "permanent", [{ to: "n.md" }]),
        ]);
        expect(criticalThinkingPrompts(model, "n.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS, "needs-evidence"]);
    });

    it("adds needs-counterpoint in isolation when nothing contradicts the note", () => {
        const model = buildModel([
            idea(
                "n.md",
                "permanent",
                [
                    { to: "e.md", type: "example" },
                    { to: "q.md", type: "question" },
                ],
                { hasSources: true, claims: [{ text: "c", sources: [{ ref: "s", kind: "text" }] }] }
            ),
            idea("in.md", "permanent", [{ to: "n.md" }]),
        ]);
        expect(criticalThinkingPrompts(model, "n.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS, "needs-counterpoint"]);
    });

    it("does not add needs-counterpoint when an incoming contradicts edge exists", () => {
        const model = buildModel([
            idea(
                "n.md",
                "permanent",
                [
                    { to: "e.md", type: "example" },
                    { to: "q.md", type: "question" },
                ],
                { hasSources: true, claims: [{ text: "c", sources: [{ ref: "s", kind: "text" }] }] }
            ),
            idea("rival.md", "permanent", [{ to: "n.md", type: "contradicts" }]),
        ]);
        expect(criticalThinkingPrompts(model, "n.md")).not.toContain("needs-counterpoint");
    });

    it("adds needs-example in isolation when there is no outgoing example relation", () => {
        const model = buildModel([
            idea(
                "n.md",
                "permanent",
                [
                    { to: "c.md", type: "contradicts" },
                    { to: "q.md", type: "question" },
                ],
                { hasSources: true, claims: [{ text: "c", sources: [{ ref: "s", kind: "text" }] }] }
            ),
            idea("in.md", "permanent", [{ to: "n.md" }]),
        ]);
        expect(criticalThinkingPrompts(model, "n.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS, "needs-example"]);
    });

    it("adds needs-connection in isolation when nobody builds on the note", () => {
        const model = buildModel([
            idea(
                "n.md",
                "permanent",
                [
                    { to: "c.md", type: "contradicts" },
                    { to: "e.md", type: "example" },
                    { to: "q.md", type: "question" },
                ],
                { hasSources: true, claims: [{ text: "c", sources: [{ ref: "s", kind: "text" }] }] }
            ),
        ]);
        expect(criticalThinkingPrompts(model, "n.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS, "needs-connection"]);
    });

    it("adds needs-question in isolation when the note raises no open question", () => {
        const model = buildModel([
            idea(
                "n.md",
                "permanent",
                [
                    { to: "c.md", type: "contradicts" },
                    { to: "e.md", type: "example" },
                ],
                { hasSources: true, claims: [{ text: "c", sources: [{ ref: "s", kind: "text" }] }] }
            ),
            idea("in.md", "permanent", [{ to: "n.md" }]),
        ]);
        expect(criticalThinkingPrompts(model, "n.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS, "needs-question"]);
    });

    it("returns the universal prompts (never []) for an unknown/unindexed target", () => {
        const model = buildModel([idea("a.md", "fleeting", [])]);
        expect(criticalThinkingPrompts(model, "missing.md")).toEqual([...UNIVERSAL_PROMPT_TOKENS]);
    });

    it("is deterministic and read-only", () => {
        const model = fullyChallenged();
        const before = model.all().length;
        expect(criticalThinkingPrompts(model, "done.md")).toEqual(criticalThinkingPrompts(model, "done.md"));
        expect(model.all().length).toBe(before);
    });
});

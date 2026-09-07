import { describe, it, expect } from "@jest/globals";
import { proposeReasoningLinks, ARGUMENT_ROLES, ROLE_RELATION } from "architecture/knowledge/traverse/reasoningLinks";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// start —supports→ mid —supports→ deep  (a reasoning chain); hubA/hubB co-cite start, deep and cand.
const model = buildModel([
    idea("start.md", "permanent", [{ to: "mid.md", type: "supports" }]),
    idea("mid.md", "permanent", [{ to: "deep.md", type: "supports" }]),
    idea("deep.md", "permanent", []),
    idea("cand.md", "permanent", []),
    idea("hubA.md", "permanent", [{ to: "start.md" }, { to: "deep.md" }, { to: "cand.md" }]),
    idea("hubB.md", "permanent", [{ to: "start.md" }, { to: "deep.md" }, { to: "cand.md" }]),
]);

describe("proposeReasoningLinks (#363, D3) — propose the next link, never commit it", () => {
    it("proposes a related note that is not yet part of the argument", () => {
        const paths = proposeReasoningLinks(model, "start.md").map((c) => c.path);
        expect(paths).toContain("cand.md");
    });

    it("excludes notes already reachable in the reasoning chain", () => {
        // deep.md is co-cited with start (so it scores) but sits two hops down the chain — not a new link.
        const paths = proposeReasoningLinks(model, "start.md").map((c) => c.path);
        expect(paths).not.toContain("deep.md");
    });

    it("carries a positive relatedness score on every candidate", () => {
        for (const candidate of proposeReasoningLinks(model, "start.md")) {
            expect(candidate.score).toBeGreaterThan(0);
        }
    });

    it("honours a limit", () => {
        expect(proposeReasoningLinks(model, "start.md", { limit: 1 }).length).toBeLessThanOrEqual(1);
    });

    it("returns nothing for an unknown start", () => {
        expect(proposeReasoningLinks(model, "missing.md")).toEqual([]);
    });

    it("maps each argument role to the relation it would commit", () => {
        expect([...ARGUMENT_ROLES]).toEqual(["reason", "counter", "example", "response"]);
        expect(ROLE_RELATION).toEqual({
            reason: "supports",
            counter: "contradicts",
            example: "example",
            response: "supports",
        });
    });
});

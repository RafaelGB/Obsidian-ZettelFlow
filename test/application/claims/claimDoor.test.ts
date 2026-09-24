import { describe, it, expect } from "@jest/globals";
import { applyClaim, claimTextsOf, CLAIM_EDIT_INDEX } from "application/claims";

/**
 * The claim gets a door (#561, epic #558).
 *
 * `ClaimSourceSchema` has parsed the `claim` field since #148, and the only way to write one was to
 * type YAML into a note by hand — measured at **0 of 94** notes in the reference vault. §XIII: a
 * capability whose only authoring path is hand-edited YAML is not shippable.
 *
 * This is the pure half of the correction: the mutation, with no Obsidian in it. Everything it must
 * not do is the interesting part — it must not reorder keys, must not drop the other claims, and
 * must not touch a thing when there is nothing to say.
 */
describe("the sentence goes into the frontmatter, and nothing else moves (#561)", () => {
    it("writes exactly one key on a note that had none", () => {
        const frontmatter: Record<string, unknown> = {};
        expect(applyClaim(frontmatter, "microservices move complexity")).toBe(true);
        expect(frontmatter).toEqual({ claim: "microservices move complexity" });
    });

    it("replaces the claim and keeps every other key, in order", () => {
        const frontmatter: Record<string, unknown> = {
            title: "Microservices",
            claim: "microservices add complexity",
            tags: ["architecture"],
        };
        expect(applyClaim(frontmatter, "microservices move complexity")).toBe(true);
        expect(Object.keys(frontmatter)).toEqual(["title", "claim", "tags"]);
        expect(frontmatter.claim).toBe("microservices move complexity");
        expect(frontmatter.tags).toEqual(["architecture"]);
    });

    it("edits the first of several and leaves the rest alone", () => {
        const frontmatter: Record<string, unknown> = { claim: ["first", "second"] };
        expect(applyClaim(frontmatter, "rewritten")).toBe(true);
        expect(frontmatter.claim).toEqual(["rewritten", "second"]);
        expect(CLAIM_EDIT_INDEX).toBe(0);
    });

    it("writes nothing at all for an empty or whitespace-only sentence", () => {
        const frontmatter: Record<string, unknown> = { title: "t", claim: "kept" };
        const before = JSON.parse(JSON.stringify(frontmatter));
        expect(applyClaim(frontmatter, "   ")).toBe(false);
        expect(applyClaim(frontmatter, "")).toBe(false);
        expect(frontmatter).toEqual(before);
    });

    it("offers no prefill for a note that only declares sources", () => {
        // The schema synthesises a basename claim from a source-only note (#148). That is an
        // accounting convenience, not something the user wrote — so the box must not pretend it is.
        expect(claimTextsOf({ source: "[[A book]]" })).toEqual([]);
        expect(claimTextsOf({})).toEqual([]);
        expect(claimTextsOf(undefined)).toEqual([]);
        expect(claimTextsOf({ claim: "one" })).toEqual(["one"]);
        expect(claimTextsOf({ claim: ["one", "two"] })).toEqual(["one", "two"]);
        expect(claimTextsOf({ claim: ["  padded  ", "", 7] })).toEqual(["padded"]);
    });
});

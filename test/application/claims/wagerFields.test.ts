import { describe, it, expect } from "@jest/globals";
import { applyClaim, applySource, applyWager, clearWager, removeClaim } from "application/claims";

/**
 * Two fields beside the claim (#570, epic #560).
 *
 * A prediction you cannot open with your own tools is not yours, so this is frontmatter on the note
 * — and, like every other mutator in this loop, it writes what it was given and nothing else.
 */
describe("the wager goes on the note, whole or not at all (#570)", () => {
    it("writes exactly two keys, and moves nothing", () => {
        const frontmatter: Record<string, unknown> = { title: "t" };
        applyClaim(frontmatter, "sales will fall");
        expect(applyWager(frontmatter, { expectation: "they fall below 100", by: "2026-12-01" })).toBe(true);
        expect(Object.keys(frontmatter)).toEqual(["title", "claim", "expect", "by"]);
        expect(frontmatter.expect).toBe("they fall below 100");
        expect(frontmatter.by).toBe("2026-12-01");
    });

    it("writes nothing at all for an incomplete pair", () => {
        for (const wager of [
            { expectation: "", by: "2026-12-01" },
            { expectation: "   ", by: "2026-12-01" },
            { expectation: "they fall", by: "" },
            { expectation: "they fall", by: "soon" },
        ]) {
            const frontmatter: Record<string, unknown> = { claim: "kept" };
            expect({ wager, wrote: applyWager(frontmatter, wager) }).toEqual({ wager, wrote: false });
            expect(frontmatter).toEqual({ claim: "kept" });
        }
    });

    it("keeps the day as a day", () => {
        // Written back as `YYYY-MM-DD`, not as an instant: what the note says is what you typed.
        const frontmatter: Record<string, unknown> = {};
        applyWager(frontmatter, { expectation: "e", by: "2026-01-09" });
        expect(frontmatter.by).toBe("2026-01-09");
    });

    it("replaces a wager rather than growing a second one", () => {
        const frontmatter: Record<string, unknown> = { expect: "old", by: "2025-01-01" };
        applyWager(frontmatter, { expectation: "new", by: "2026-12-01" });
        expect(frontmatter).toEqual({ expect: "new", by: "2026-12-01" });
    });
});

/**
 * Taking it back (#570 FR-6).
 *
 * Both halves go together, and nothing else goes with them: an expectation about a claim you no
 * longer hold is litter, but the claim's own source is not the wager's business.
 */
describe("the wager can be taken off, and takes nothing with it (#570)", () => {
    it("removes both halves", () => {
        const frontmatter: Record<string, unknown> = { claim: "c", expect: "e", by: "2026-12-01" };
        expect(clearWager(frontmatter)).toBe(true);
        expect(frontmatter).toEqual({ claim: "c" });
    });

    it("says so when there was nothing to remove", () => {
        const frontmatter: Record<string, unknown> = { claim: "c" };
        expect(clearWager(frontmatter)).toBe(false);
        expect(frontmatter).toEqual({ claim: "c" });
    });

    it("removes a half-written one too", () => {
        const frontmatter: Record<string, unknown> = { expect: "e" };
        expect(clearWager(frontmatter)).toBe(true);
        expect(frontmatter).toEqual({});
    });

    it("never touches the claim or its source", () => {
        const frontmatter: Record<string, unknown> = {};
        applyClaim(frontmatter, "sales will fall");
        applySource(frontmatter, "[[The book]]");
        applyWager(frontmatter, { expectation: "e", by: "2026-12-01" });
        clearWager(frontmatter);
        expect(frontmatter).toEqual({ claim: "sales will fall", source: "[[The book]]" });
    });

    it("leaves the note clean when the claim is withdrawn with it", () => {
        // #562's third answer: an expectation about a claim you no longer hold is not a wager.
        const frontmatter: Record<string, unknown> = { title: "t" };
        applyClaim(frontmatter, "sales will fall");
        applyWager(frontmatter, { expectation: "e", by: "2026-12-01" });
        removeClaim(frontmatter, 0);
        clearWager(frontmatter);
        expect(frontmatter).toEqual({ title: "t" });
    });
});

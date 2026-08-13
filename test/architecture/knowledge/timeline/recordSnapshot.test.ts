import { describe, it, expect } from "@jest/globals";
import { recordSnapshot, Snapshot, DEFAULT_MAX_LEN } from "architecture/knowledge/timeline/recordSnapshot";
import { idea } from "../../../actions/knowledge/support/knowledgeFixture";

describe("recordSnapshot (#168, FR-2/FR-3/FR-8, AC-1)", () => {
    it("records a baseline on the first observation of a note", () => {
        const note = idea("n.md", "fleeting", [], { claims: [{ text: "c1" }] });
        expect(recordSnapshot([], note, 100)).toEqual([{ at: 100, state: "fleeting", claims: ["c1"] }]);
    });

    it("returns the same array unchanged when neither state nor claim-set changed", () => {
        const history: Snapshot[] = [{ at: 1, state: "fleeting", claims: ["c1"] }];
        const note = idea("n.md", "fleeting", [], { claims: [{ text: "c1" }] });
        expect(recordSnapshot(history, note, 2)).toBe(history);
    });

    it("appends when the state changed", () => {
        const history: Snapshot[] = [{ at: 1, state: "fleeting", claims: ["c1"] }];
        const note = idea("n.md", "permanent", [], { claims: [{ text: "c1" }] });
        expect(recordSnapshot(history, note, 2)).toEqual([
            { at: 1, state: "fleeting", claims: ["c1"] },
            { at: 2, state: "permanent", claims: ["c1"] },
        ]);
    });

    it("appends when a claim text was edited", () => {
        const history: Snapshot[] = [{ at: 1, state: "permanent", claims: ["AI replaces us"] }];
        const note = idea("n.md", "permanent", [], { claims: [{ text: "AI is a copilot" }] });
        expect(recordSnapshot(history, note, 2)).toEqual([
            { at: 1, state: "permanent", claims: ["AI replaces us"] },
            { at: 2, state: "permanent", claims: ["AI is a copilot"] },
        ]);
    });

    it("does not append when only the claim order changed (order-insensitive set)", () => {
        const history: Snapshot[] = [{ at: 1, state: "permanent", claims: ["a", "b"] }];
        const note = idea("n.md", "permanent", [], { claims: [{ text: "b" }, { text: "a" }] });
        expect(recordSnapshot(history, note, 2)).toBe(history);
    });

    it("drops the oldest snapshot when the per-note cap is exceeded", () => {
        const history: Snapshot[] = [
            { at: 1, state: "fleeting", claims: ["a"] },
            { at: 2, state: "literature", claims: ["a"] },
            { at: 3, state: "developing", claims: ["a"] },
        ];
        const note = idea("n.md", "permanent", [], { claims: [{ text: "a" }] });
        expect(recordSnapshot(history, note, 4, { maxLen: 3 })).toEqual([
            { at: 2, state: "literature", claims: ["a"] },
            { at: 3, state: "developing", claims: ["a"] },
            { at: 4, state: "permanent", claims: ["a"] },
        ]);
    });

    it("never mutates the input history and defaults to a 20-entry cap", () => {
        expect(DEFAULT_MAX_LEN).toBe(20);
        const history: Snapshot[] = [{ at: 1, state: "fleeting", claims: ["a"] }];
        recordSnapshot(history, idea("n.md", "permanent", [], { claims: [{ text: "a" }] }), 2);
        expect(history).toEqual([{ at: 1, state: "fleeting", claims: ["a"] }]);
    });

    it("never throws on empty/blank claims", () => {
        const note = idea("n.md", "fleeting", [], { claims: [{ text: "  " }] });
        expect(recordSnapshot([], note, 1)).toEqual([{ at: 1, state: "fleeting", claims: [] }]);
        expect(recordSnapshot([], idea("m.md", "fleeting", []), 1)).toEqual([
            { at: 1, state: "fleeting", claims: [] },
        ]);
    });
});

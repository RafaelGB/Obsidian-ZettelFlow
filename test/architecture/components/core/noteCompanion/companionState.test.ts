import { describe, it, expect } from "@jest/globals";
import {
    NOTE_COMPANION_VIEW,
    parseCompanionState,
} from "architecture/components/core/noteCompanion/noteCompanionContract";

describe("the companion's view-state contract (#640 FR-19, AC-9)", () => {
    it("is the zettelflow-note view", () => {
        expect(NOTE_COMPANION_VIEW).toBe("zettelflow-note");
    });

    it("keeps the note and the pin", () => {
        expect(parseCompanionState({ path: "a.md", pinned: true })).toEqual({ path: "a.md", pinned: true });
    });

    it("accepts the three focuses and drops anything else", () => {
        expect(parseCompanionState({ focus: "next" }).focus).toBe("next");
        expect(parseCompanionState({ focus: "nearby" }).focus).toBe("nearby");
        expect(parseCompanionState({ focus: "gaps" }).focus).toBe("gaps");
        expect(parseCompanionState({ focus: "bogus" })).toEqual({});
    });

    it("accepts only a real next move", () => {
        expect(parseCompanionState({ move: "connect" }).move).toBe("connect");
        expect(parseCompanionState({ move: "teleport" })).toEqual({});
    });

    it("drops values of the wrong type", () => {
        expect(parseCompanionState({ path: 3, pinned: "yes" })).toEqual({});
    });

    it("never throws on a payload that is not an object", () => {
        expect(parseCompanionState(null)).toEqual({});
        expect(parseCompanionState(42)).toEqual({});
        expect(parseCompanionState(undefined)).toEqual({});
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    INITIAL_NEXT_UI,
    anotherMove,
    clampMove,
    closePanel,
    deepLink,
    openPanel,
    rederive,
} from "architecture/components/core/noteCompanion/nextStepUi";

describe("the next-step card's state (#641 FR-6/9/21)", () => {
    it("steps to another move, wrapping, and closes the panel", () => {
        expect(anotherMove({ index: 0, open: true }, 3)).toEqual({ index: 1, open: false });
        expect(anotherMove({ index: 2, open: false }, 3)).toEqual({ index: 0, open: false });
    });

    it("opens and closes the panel without moving", () => {
        expect(openPanel({ index: 1, open: false })).toEqual({ index: 1, open: true });
        expect(closePanel({ index: 1, open: true })).toEqual({ index: 1, open: false });
    });

    it("starts again on the first move after a write lands", () => {
        expect(rederive()).toEqual(INITIAL_NEXT_UI);
    });

    it("keeps the index inside the moves there are", () => {
        expect(clampMove({ index: 2, open: true }, 2)).toEqual(INITIAL_NEXT_UI);
        expect(clampMove({ index: 1, open: true }, 2)).toEqual({ index: 1, open: true });
    });

    it("lands a hand-over on its move, open — or on the first, closed, when the note no longer has it", () => {
        expect(deepLink(["add-source", "connect"], "connect")).toEqual({ index: 1, open: true });
        expect(deepLink(["add-source"], "connect")).toEqual(INITIAL_NEXT_UI);
        expect(deepLink(["add-source"])).toEqual(INITIAL_NEXT_UI);
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    alreadyApplied,
    captureContributions,
    discardedCount,
    isReplayable,
    popRedo,
    pushRedo,
} from "application/components/noteBuilder/walkHistory";

describe("jumping back to any step is safe (#413)", () => {
    it("counts what a jump discards", () => {
        const walked = [0, 1, 2, 3, 4];
        expect(discardedCount(walked, 4)).toBe(1);
        expect(discardedCount(walked, 2)).toBe(3);
        expect(discardedCount(walked, 0)).toBe(5);
        expect(discardedCount(walked, 9)).toBe(0);
        expect(discardedCount([], 0)).toBe(0);
    });

    it("captures exactly what deletePos would drop, in order", () => {
        const paths = new Map([
            [0, "a.md"],
            [2, "c.md"],
            [1, "b.md"],
        ]);
        const elements = new Map([
            [1, { type: "prompt", id: "p", result: "x" }],
            [3, { type: "tags", id: "t", result: ["y"] }],
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const captured = captureContributions(paths, elements as any, 1);
        expect(captured.paths).toEqual([
            [1, "b.md"],
            [2, "c.md"],
        ]);
        expect(captured.elements.map(([position]) => position)).toEqual([1, 3]);
    });

    it("captures nothing when the jump discards nothing", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const captured = captureContributions(new Map([[0, "a.md"]]), new Map() as any, 5);
        expect(captured).toEqual({ paths: [], elements: [] });
    });

    it("knows which steps cannot be unwound", () => {
        expect(isReplayable("prompt")).toBe(true);
        expect(isReplayable(undefined)).toBe(true);
        expect(isReplayable("script")).toBe(false);
        expect(isReplayable("ai")).toBe(false);
        expect(isReplayable("summarize", "ai")).toBe(false);
        expect(isReplayable("tags", "knowledge")).toBe(true);
    });

    it("names the already-applied steps a jump would pass", () => {
        expect(
            alreadyApplied([
                { title: "Type", actionType: "selector" },
                { title: "Summarise", actionType: "summarize", category: "ai" },
                { title: "Index", actionType: "script" },
            ])
        ).toEqual(["Summarise", "Index"]);
    });

    it("keeps redo a line, not a tree", () => {
        const entry = { position: 2, section: "s", contribution: { paths: [], elements: [] } };
        const stack = pushRedo(pushRedo([], entry), { ...entry, position: 3 });
        const { entry: last, rest } = popRedo(stack);
        expect(last?.position).toBe(3);
        expect(rest).toHaveLength(1);
        expect(popRedo([]).entry).toBeUndefined();
    });
});

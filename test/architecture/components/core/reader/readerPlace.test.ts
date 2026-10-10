import { describe, it, expect } from "@jest/globals";
import { placeAt, scrollFor, type Box } from "architecture/components/core/reader/readerPlace";

/** Blocks stacked one under the other, each `heights[i]` tall. */
function stack(heights: number[]): Box[] {
    let top = 0;
    return heights.map((height) => {
        const box = { top, height };
        top += height;
        return box;
    });
}

/** A place that survives a reshape (#750 FR-11): rotation, Split View, a window resized. */
describe("the line you were reading stays in view (#750)", () => {
    const heights = [120, 300, 80, 400, 260, 90];

    it("is the first block that crosses the top of the stage, and how far into it", () => {
        const blocks = stack(heights);
        expect(placeAt(blocks, 0)).toEqual({ block: 0, within: 0 });
        expect(placeAt(blocks, 270)).toEqual({ block: 1, within: 0.5 });
        expect(placeAt(blocks, 500)).toEqual({ block: 3, within: 0 });
        expect(placeAt([], 100)).toEqual({ block: 0, within: 0 });
        // Past the last block: still the last one, at its end.
        expect(placeAt(blocks, 99999)).toEqual({ block: 5, within: 1 });
    });

    it("lands on the same block when every block grows (a narrower column: landscape to portrait)", () => {
        const before = stack(heights);
        const place = placeAt(before, 700);
        const after = stack(heights.map((h) => h * 2));
        const top = scrollFor(place, after);
        expect(placeAt(after, top)).toEqual(place);
        expect(top).toBe(after[place.block].top + place.within * after[place.block].height);
    });

    it("lands on the same block when the stage halves (Split View)", () => {
        const before = stack(heights.map((h) => h * 2));
        const place = placeAt(before, 1900);
        const after = stack(heights);
        expect(placeAt(after, scrollFor(place, after)).block).toBe(place.block);
    });

    it("has nowhere to go when there are no blocks", () => {
        expect(scrollFor({ block: 3, within: 0.5 }, [])).toBe(0);
    });
});

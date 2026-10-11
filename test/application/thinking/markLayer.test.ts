import { describe, it, expect } from "@jest/globals";
import { DEFAULT_LAYER, MARK_LAYERS, isLayer, layerOf } from "application/thinking/markLayer";

describe("the layer a mark was made on (#758 AC-1)", () => {
    it("is one of three, closed", () => {
        expect(MARK_LAYERS).toEqual(["reading", "reflection", "research"]);
        expect(isLayer("reflection")).toBe(true);
        expect(isLayer("draft")).toBe(false);
        expect(isLayer(undefined)).toBe(false);
        expect(isLayer(3)).toBe(false);
    });

    it("reads as reading when a mark has none — every mark made before layers", () => {
        expect(DEFAULT_LAYER).toBe("reading");
        expect(layerOf({})).toBe("reading");
        expect(layerOf({ layer: "research" })).toBe("research");
        // A value from a newer build, or a hand edit: the reading layer, never an error.
        expect(layerOf({ layer: "draft" as never })).toBe("reading");
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    DEFAULT_WIZARD_DENSITY,
    NO_CANVAS_COLOR,
    densityModifier,
    normalizeDensity,
    stepAccent,
} from "application/components/noteBuilder/presentation";

describe("the step accent only exists when there is a colour to paint (#409)", () => {
    it("passes through an rgb triple, as getCanvasColor produces for a hex node", () => {
        expect(stepAccent("255, 0, 0")).toBe("255, 0, 0");
    });

    it("passes through a canvas colour variable, as it produces for a preset node", () => {
        expect(stepAccent("var(--canvas-color-3)")).toBe("var(--canvas-color-3)");
    });

    it("yields nothing for the no-colour sentinel, rather than an invalid declaration", () => {
        expect(stepAccent(NO_CANVAS_COLOR)).toBeUndefined();
    });

    it("yields nothing for empty or missing values", () => {
        expect(stepAccent("")).toBeUndefined();
        expect(stepAccent("   ")).toBeUndefined();
        expect(stepAccent(undefined)).toBeUndefined();
    });
});

describe("density survives whatever is in the settings file (#409)", () => {
    it("keeps a known value", () => {
        expect(normalizeDensity("compact")).toBe("compact");
        expect(normalizeDensity("comfortable")).toBe("comfortable");
    });

    it("falls back to the default for anything else", () => {
        expect(normalizeDensity(undefined)).toBe(DEFAULT_WIZARD_DENSITY);
        expect(normalizeDensity(null)).toBe(DEFAULT_WIZARD_DENSITY);
        expect(normalizeDensity("cosy")).toBe(DEFAULT_WIZARD_DENSITY);
        expect(normalizeDensity(7)).toBe(DEFAULT_WIZARD_DENSITY);
    });

    it("only the compact mode adds a modifier", () => {
        expect(densityModifier("compact")).toBe("is-compact");
        expect(densityModifier("comfortable")).toBeUndefined();
    });
});

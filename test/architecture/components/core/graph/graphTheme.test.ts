import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
    communityRgba,
    cssRgb,
    luminance,
    parseCssColour,
    PALETTE_VARS,
    readGraphTheme,
    stateRgba,
} from "architecture/components/core/graph/graphTheme";

const GRAPH_SRC = join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "graph");

/** A dark theme as Obsidian's default writes it. */
const DARK: Record<string, string> = {
    "--background-primary": "#1e1e1e",
    "--text-normal": "#dadada",
    "--text-muted": "rgb(163, 163, 163)",
    "--text-faint": "#6f6f6f",
    "--interactive-accent": "hsl(258, 88%, 66%)",
    "--color-red": "#fb464c",
    "--color-orange": "#e9973f",
    "--color-yellow": "#e0de71",
    "--color-green": "#44cf6e",
    "--color-cyan": "#53dfdd",
    "--color-blue": "#4fa8f0",
    "--color-purple": "#a882ff",
    "--color-pink": "#fa99cd",
};
const LIGHT: Record<string, string> = { ...DARK, "--background-primary": "#ffffff", "--text-normal": "#222222" };

/**
 * **The user's theme wins** (§XV, #693) — the sky included. The old view painted a fixed
 * `#0b0e14` and eighteen hexes tuned for it; every colour here is read from the theme.
 */
describe("the graph's colours come from the theme (§XV, #693)", () => {
    it("reads the sky from the theme's background", () => {
        expect(readGraphTheme((name) => DARK[name] ?? "").bg).toEqual(parseCssColour("#1e1e1e"));
        expect(readGraphTheme((name) => LIGHT[name] ?? "").bg).toEqual([1, 1, 1, 1]);
    });

    it("tells a dark sky from a light one", () => {
        expect(readGraphTheme((name) => DARK[name] ?? "").dark).toBe(true);
        expect(readGraphTheme((name) => LIGHT[name] ?? "").dark).toBe(false);
    });

    it("builds the palette from the theme's eight accents, then two more tones of them", () => {
        const theme = readGraphTheme((name) => DARK[name] ?? "");
        expect(theme.palette).toHaveLength(PALETTE_VARS.length * 3);
        expect(theme.palette[0]).toEqual(parseCssColour(DARK["--color-blue"]));
        // The second tone moves toward the text: in a dark theme, lighter than the accent.
        expect(luminance(theme.palette[8])).toBeGreaterThan(luminance(theme.palette[0]));
    });

    it("wraps rather than running out, and gives a lone note the theme's muted text", () => {
        const theme = readGraphTheme((name) => DARK[name] ?? "");
        expect(communityRgba(theme, theme.palette.length)).toEqual(theme.palette[0]);
        expect(communityRgba(theme, -1)).toEqual(theme.muted);
    });

    it("colours maturity by the state variables, and an unknown state by the default", () => {
        const theme = readGraphTheme((name) => DARK[name] ?? "");
        expect(stateRgba(theme, "permanent")).toEqual(parseCssColour(DARK["--color-green"]));
        expect(stateRgba(theme, "nonsense")).toEqual(theme.stateDefault);
    });

    it("writes no colour of its own anywhere in the graph's code", () => {
        // Comments may name a colour (the history of the fixed sky); code may not choose one.
        const offenders: string[] = [];
        for (const file of readdirSync(GRAPH_SRC)) {
            const code = readFileSync(join(GRAPH_SRC, file), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/.*$/gm, "");
            const hexes = code.match(/["'`]#[0-9a-fA-F]{3,8}["'`]/g) ?? [];
            // The one sentinel the pixel resolver uses to detect an unparseable colour is not a colour choice.
            for (const hex of hexes) if (!hex.includes("010203")) offenders.push(`${file}: ${hex}`);
        }
        expect(offenders).toEqual([]);
    });
});

describe("parsing what a computed style hands back (#693)", () => {
    it("reads every hex form", () => {
        expect(parseCssColour("#fff")).toEqual([1, 1, 1, 1]);
        expect(parseCssColour("#000000")).toEqual([0, 0, 0, 1]);
        expect(parseCssColour("#ff000080")?.[3]).toBeCloseTo(128 / 255, 5);
    });

    it("reads rgb() and rgba(), with commas or spaces", () => {
        expect(parseCssColour("rgb(255, 0, 0)")).toEqual([1, 0, 0, 1]);
        expect(parseCssColour("rgba(0 255 0 / 0.5)")).toEqual([0, 1, 0, 0.5]);
    });

    it("reads hsl()", () => {
        const red = parseCssColour("hsl(0, 100%, 50%)") as number[];
        expect(red[0]).toBeCloseTo(1, 5);
        expect(red[1]).toBeCloseTo(0, 5);
    });

    it("says null for what it cannot read, so the app's resolver paints it instead", () => {
        expect(parseCssColour("oklch(70% 0.1 200)")).toBeNull();
        expect(parseCssColour("")).toBeNull();
    });

    it("hands a colour back to the DOM as rgba()", () => {
        expect(cssRgb([1, 0, 0, 1])).toBe("rgba(255, 0, 0, 1)");
        expect(cssRgb([0, 0, 1, 1], 0.25)).toBe("rgba(0, 0, 255, 0.25)");
    });
});

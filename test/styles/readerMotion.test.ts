import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");
const SHEETS = ["components/reader.scss", "components/shelf.scss"];

/** What a compositor animates without a layout or a paint: the only things motion may touch (#724). */
const COMPOSITOR = new Set(["transform", "opacity", "scale", "translate", "rotate", "visibility"]);

/**
 * Motion that predates the rule, named so it can only shrink. Each one is a single element on a
 * user action, never something that runs while you read.
 */
const LEGACY_KEYFRAMES = new Set([
    "zf-reader-highlight-sweep", // the marker drawn across a new highlight: background-size
    "zf-reader-highlight-flash", // a deep-linked highlight's ring: box-shadow
]);
const LEGACY_TRANSITIONS = new Set(["width", "box-shadow", "border-color"]);

function sheet(path: string): string {
    return readFileSync(join(STYLES, path), "utf8");
}

describe("motion in the Reader and the Library never costs a frame (#724)", () => {
    it("animates only what the compositor moves, in every keyframe", () => {
        const offenders: string[] = [];
        for (const path of SHEETS) {
            const css = sheet(path);
            for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
                if (LEGACY_KEYFRAMES.has(match[1])) continue;
                const props = [...match[2].matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
                for (const prop of props) if (!COMPOSITOR.has(prop)) offenders.push(`${path} @keyframes ${match[1]}: ${prop}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("transitions only what the compositor moves, beyond the named legacy", () => {
        const offenders: string[] = [];
        for (const path of SHEETS) {
            for (const match of sheet(path).matchAll(/transition:\s*([^;]+);/g)) {
                if (match[1].trim() === "none") continue;
                for (const part of match[1].split(",")) {
                    const prop = part.trim().split(/\s+/)[0];
                    if (!COMPOSITOR.has(prop) && !LEGACY_TRANSITIONS.has(prop)) offenders.push(`${path}: transition ${prop}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("gives every animation an instant equivalent under reduced motion", () => {
        for (const path of SHEETS) {
            const css = sheet(path);
            if (!/animation:\s*(?!none)/.test(css)) continue;
            expect(css).toContain("prefers-reduced-motion: reduce");
        }
    });

    it("keeps the motion tokens in one place", () => {
        const motion = sheet("utils/motion.scss");
        for (const token of ["$motion-fast", "$motion-base", "$motion-cover", "$ease-out"]) expect(motion).toContain(token);
    });
});

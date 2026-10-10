import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");
const SHEETS = ["components/reader.scss", "components/readerSource.scss", "components/readerDesigned.scss", "components/shelf.scss"];
const SCRIPTS = [join(__dirname, "..", "..", "src", "architecture", "components", "core", "reader"), join(__dirname, "..", "..", "src", "architecture", "components", "core", "library", "sources")];
/** What a scripted keyframe may name besides a property: where it sits, and how it eases. */
const KEYFRAME_FIELDS = new Set(["offset", "easing", "composite"]);

/** What a compositor animates without a layout or a paint: the only things motion may touch (#724). */
const COMPOSITOR = new Set(["transform", "opacity", "scale", "translate", "rotate", "visibility"]);

/**
 * Motion that predates the rule, named so it can only shrink. Each one is a single element on a
 * user action, never something that runs while you read.
 */
const LEGACY_KEYFRAMES = new Set([
    "zf-reader-highlight-sweep", // the marker drawn across a new highlight: background-size
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

    it("gives the iPad's motions an instant equivalent too (#750 AC-11)", () => {
        const css = sheet("components/reader.scss");
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        for (const selector of ["reader-panel--sheet", "reader-sheet-scrim", "reader-covers-app", "reader-page--under-scrub", ".mobile-navbar", ".workspace-tab-header-container"]) {
            expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
        }
        expect(reduced).toMatch(/transition: none;\s*animation: none;/);
    });

    it("animates only what the compositor moves in the Reader's scripted keyframes too (#753 AC-8)", () => {
        const offenders: string[] = [];
        for (const dir of SCRIPTS) {
            for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
                const code = readFileSync(join(dir, name), "utf8");
                for (const match of code.matchAll(/\.animate\(\s*\[/g)) {
                    // The keyframe list, to its matching bracket.
                    let depth = 0;
                    let end = match.index + match[0].length - 1;
                    for (; end < code.length; end++) {
                        if (code[end] === "[") depth++;
                        else if (code[end] === "]" && --depth === 0) break;
                    }
                    const frames = code.slice(match.index + match[0].length, end);
                    for (const key of frames.matchAll(/[{,]\s*([a-zA-Z]+)\s*:/g)) {
                        if (!COMPOSITOR.has(key[1]) && !KEYFRAME_FIELDS.has(key[1])) offenders.push(`${name}: ${key[1]}`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("keeps the motion tokens in one place", () => {
        const motion = sheet("utils/motion.scss");
        for (const token of ["$motion-fast", "$motion-base", "$motion-cover", "$ease-out"]) expect(motion).toContain(token);
    });
});

describe("the type you can tune is never animated (#757 FR-14, AC-8)", () => {
    const TYPE_PROPS = ["--reader-leading", "--reader-measure", "--reader-gutter", "--reader-page-max"];

    it("sets line spacing, width and margins at once: no rule that sets them transitions", () => {
        const offenders: string[] = [];
        for (const path of SHEETS) {
            // Every innermost rule: its selector and its declarations.
            for (const rule of sheet(path).matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
                const body = rule[2];
                if (TYPE_PROPS.some((prop) => new RegExp(`${prop}\\s*:`).test(body)) && /transition\s*:/.test(body)) offenders.push(`${path}: ${rule[1].trim()}`);
            }
            for (const match of sheet(path).matchAll(/transition:\s*([^;]+);/g)) {
                for (const part of match[1].split(",")) {
                    const prop = part.trim().split(/\s+/)[0];
                    if (["line-height", "max-width", "padding", "text-align", "all"].includes(prop)) offenders.push(`${path}: transition ${prop}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("keeps 3.6's page width in one place, the --reader-page-max default (Risk 2)", () => {
        const css = sheet("components/reader.scss");
        const literal = css.split("\n").filter((line) => line.includes("48rem")).map((line) => line.trim());
        expect(literal).toEqual(["--reader-page-max: 48rem;"]);
        expect(css).toContain("--reader-leading: 1.75;");
        expect(css).toContain("--reader-measure: 68ch;");
        expect(css).toContain("--reader-gutter: var(--size-4-6);");
    });
});


describe("bookmarks and the trail move like the rest of the Reader (#761 AC-8)", () => {
    const css = sheet("components/reader.scss");
    /** A keyframes block, to its closing brace at the start of a line. */
    const keyframes = (name: string) => {
        const start = css.indexOf(`@keyframes ${name} {`);
        return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
    };

    it("drops the ribbon in and lifts it out on transform alone, in the shared beat", () => {
        for (const name of ["zf-reader-ribbon-drop", "zf-reader-ribbon-lift"]) {
            const props = [...keyframes(name).matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
            expect({ name, props: [...new Set(props)] }).toEqual({ name, props: ["transform"] });
        }
        // A small settle at the end: the drop overshoots before it rests.
        expect(keyframes("zf-reader-ribbon-drop")).toMatch(/translateY\(8%\)/);
        expect(css).toMatch(/reader-ribbon--drop[^{]*\{\s*animation: zf-reader-ribbon-drop \$motion-base \$ease-out both;/);
    });

    it("fades an empty tab in at the fast beat, and marks a landing with opacity alone", () => {
        expect(css).toMatch(/reader-empty \{[^}]*animation: zf-reader-fade \$motion-fast/);
        const here = [...keyframes("zf-reader-here").matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
        expect([...new Set(here)]).toEqual(["opacity"]);
    });

    it("gives the ribbon, the tabs, the empty states and the landing mark an instant equivalent", () => {
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        for (const selector of ["reader-ribbon", "reader-ribbon-mark", "reader-tab-list", "reader-empty", "reader-here::after"]) {
            expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
        }
    });

    it("retires the box-shadow flash: the legacy motion only ever shrinks", () => {
        expect(css).not.toContain("zf-reader-highlight-flash");
        expect(css).not.toContain("reader-highlight--flash");
        expect([...LEGACY_KEYFRAMES]).toEqual(["zf-reader-highlight-sweep"]);
    });
});

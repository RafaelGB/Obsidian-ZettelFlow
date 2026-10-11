import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");
const SHEETS = ["components/reader.scss", "components/readerSource.scss", "components/readerDesigned.scss", "components/shelf.scss", "components/ink.scss", "components/readerSurvived.scss"];
const SCRIPTS = [
    join(__dirname, "..", "..", "src", "architecture", "components", "core", "reader"),
    join(__dirname, "..", "..", "src", "architecture", "components", "core", "library", "sources"),
    // The Library's own motion (#743): a book's Details, a card changing row, a chip dropping in.
    join(__dirname, "..", "..", "src", "architecture", "components", "core", "library"),
];
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

    it("gives the look-up card and its ink an instant equivalent (#766 AC-11)", () => {
        const css = sheet("components/reader.scss");
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(reduced).toContain(".zettelkasten-flow__reader-lookup-card");
        expect(reduced).toContain(".zettelkasten-flow__reader-ink-wait span");
        // Its card is placed by custom properties, and grows from the words' point: never a layout move.
        const card = css.slice(css.indexOf(".zettelkasten-flow__reader-lookup-card {"), css.indexOf(".zettelkasten-flow__reader-lookup-card--leaving"));
        expect(card).toContain("transform-origin: var(--zf-origin-x, 50%) var(--zf-origin-y, 0);");
        expect(card).not.toMatch(/transition:/);
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

describe("ink moves like the rest of the Reader (#745 AC-14, FR-20–FR-25)", () => {
    const css = sheet("components/ink.scss");

    it("is in the motion guardrail's list", () => {
        expect(SHEETS).toContain("components/ink.scss");
    });

    it("slides the palette and settles the ink on the shared tokens", () => {
        expect(css).toMatch(/transform \$motion-fast \$ease-out/);
        expect(css).toMatch(/opacity \$motion-base \$ease-out/);
    });

    it("gives the palette, the marker, the fades and the kept tone an instant equivalent", () => {
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        for (const selector of ["reader-ink-palette", "reader-ink-marker", "reader-ink-note", "reader-ink-stroke", "reader-ink-live"]) {
            expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
        }
        expect(reduced).toMatch(/transition: none;/);
    });
});

describe("a passage a note goes back to arrives like the rest of the Reader (#751 AC-9)", () => {
    const css = sheet("components/reader.scss");
    const companion = sheet("components/noteCompanion.scss");
    const keyframes = (from: string, name: string) => {
        const start = from.indexOf(`@keyframes ${name} {`);
        return start < 0 ? "" : from.slice(start, from.indexOf("\n}", start));
    };
    const props = (block: string) => [...new Set([...block.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]))];

    it("slides the not-found line 8 px and fades it, in and out, at the fast beat", () => {
        for (const name of ["zf-reader-passage-in", "zf-reader-passage-out"]) {
            expect({ name, props: props(keyframes(css, name)).sort() }).toEqual({ name, props: ["opacity", "translate"] });
            expect(keyframes(css, name)).toContain("var(--size-4-2)");
        }
        expect(css).toMatch(/reader-passage-missing \{[^}]*animation: zf-reader-passage-in \$motion-fast/);
        expect(props(keyframes(companion, "zf-note-companion-copied"))).toEqual(["opacity"]);
    });

    it("gives the not-found line and Link copied an instant equivalent", () => {
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(reduced).toContain("reader-passage-missing");
        const companionReduced = companion.slice(companion.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
        expect(companionReduced).toContain("note-companion-origin-label--copied");
    });
});

describe("Alongside moves like a margin, never like a redraw (#754 AC-10)", () => {
    const css = sheet("components/reader.scss");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    /** Alongside's own rules, from its heading to the next section's. */
    const own = css.slice(css.indexOf("── Alongside (#754)"), css.indexOf("── peeks and detours (#670)"));
    const rule = (selector: string) => {
        const at = own.indexOf(`${selector} {`);
        return at < 0 ? "" : own.slice(at, own.indexOf("\n}", at));
    };

    it("slides in from the column's edge on transform and opacity, at the base beat, and leaves the same way", () => {
        const enter = css.slice(css.indexOf("@keyframes zf-reader-alongside-in"));
        const frames = enter.slice(0, enter.indexOf("\n}"));
        expect([...frames.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]).sort()).toEqual(["opacity", "transform"]);
        expect(rule(".zettelkasten-flow__reader-panel.zettelkasten-flow__reader-panel--side")).toContain("animation: zf-reader-alongside-in $motion-base $ease-out");
        const leaving = rule(".zettelkasten-flow__reader-panel.zettelkasten-flow__reader-panel--side.zettelkasten-flow__reader-panel--leaving");
        expect(leaving).toContain("opacity: 0;");
        expect(leaving).toContain("transform: translateX(var(--size-4-8));");
    });

    it("gives the panel, the lens fill and a leaving card an instant equivalent", () => {
        for (const selector of ["reader-panel--side", "reader-lens-marker", "reader-flip-leaving"]) {
            expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
        }
    });

    it("takes a leaving card out of the flow, so the others close the gap by moving, never by height", () => {
        expect(rule(".zettelkasten-flow__reader-flip-leaving")).toContain("position: absolute;");
        expect(own.length).toBeGreaterThan(0);
        for (const match of own.matchAll(/transition:\s*([^;]+);/g)) expect(match[1]).not.toMatch(/\b(height|width)\b/);
    });

    it("moves ink's palette out of the column's way: above the bar, centred under the narrowed column (#745 beside #754)", () => {
        const ink = sheet("components/ink.scss");
        const at = ink.indexOf(".zettelkasten-flow__reader--alongside {");
        expect(at).toBeGreaterThan(0);
        const block = ink.slice(at, ink.indexOf("\n}", at));
        expect(block).toContain("@include palette-above-bar;");
        expect(block).toContain("left: calc((100% - var(--zf-alongside-w) - var(--size-4-6)) / 2);");
    });
});

describe("moves answered by your vault move like the rest of the Reader (#756 AC-10)", () => {
    const css = sheet("components/reader.scss");
    const own = css.slice(css.indexOf("── Moves answered by your vault (#756)"), css.indexOf("── peeks and detours (#670)"));

    it("gives the answer, a card in its list, the picker, From this reading and the tension tick an instant equivalent", () => {
        const reduced = own.slice(own.indexOf("@media (prefers-reduced-motion: reduce)"));
        for (const selector of ["reader-proposal-group", "reader-proposal--flow", "reader-idea-picker", "reader-from-reading", "reader-highlight--tension"]) {
            expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
        }
    });

    it("fades the tension tick in on opacity alone, at the fast beat", () => {
        const start = own.indexOf("@keyframes zf-reader-tension-in {");
        const frames = own.slice(start, own.indexOf("\n}", start));
        expect([...frames.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1])).toEqual(["opacity"]);
        expect(own).toContain("animation: zf-reader-tension-in $motion-fast $ease-out backwards;");
        for (const match of own.matchAll(/transition:\s*([^;]+);/g)) expect(match[1]).not.toMatch(/\b(height|width|top|left)\b/);
    });
});

describe("the claim sheet and its tick move like the rest of the Reader (#762 AC-7)", () => {
    const css = sheet("components/reader.scss");
    const own = css.slice(css.indexOf("── Moves answered by your vault (#756)"), css.indexOf("── peeks and detours (#670)"));

    it("gives the sheet, the picker and the claim tick an instant equivalent", () => {
        const reduced = own.slice(own.indexOf("@media (prefers-reduced-motion: reduce)"));
        for (const selector of ["reader-claim-sheet", "reader-highlight--claim", "reader-idea-picker"]) {
            expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
        }
    });

    it("fades the claim tick in on opacity alone, at the fast beat, and only once", () => {
        const start = own.indexOf("@keyframes zf-reader-claim-in {");
        const frames = own.slice(start, own.indexOf("\n}", start));
        expect([...frames.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1])).toEqual(["opacity"]);
        expect(own).toContain("animation: zf-reader-claim-in $motion-fast $ease-out backwards;");
        const kept = own.slice(own.indexOf(".zettelkasten-flow__reader-highlight--claim-kept"));
        expect(kept.slice(0, kept.indexOf("}"))).toContain("animation: none;");
    });

    it("grows the picker from the button it was asked from", () => {
        expect(own).toContain("transform-origin: var(--zf-origin-x, 0) var(--zf-origin-y, 0);");
    });
});

describe("waiting on your AI provider feels like a pen about to write (#759 FR-13, FR-16, AC-8)", () => {
    const css = sheet("components/reader.scss");
    const keyframes = (name: string) => {
        const start = css.indexOf(`@keyframes ${name} {`);
        return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
    };

    it("breathes the ink on opacity alone, .35 to .7 over 1.2 s, eased and staggered", () => {
        const frames = keyframes("zf-reader-pen-breathe");
        expect([...new Set([...frames.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]))]).toEqual(["opacity"]);
        expect(frames).toContain("opacity: 0.35;");
        expect(frames).toContain("opacity: 0.7;");
        expect(css).toContain("animation: zf-reader-pen-breathe 1.2s ease-in-out infinite alternate;");
        expect(css).toContain("animation-delay: 200ms;");
        expect(css).toContain("animation-delay: 400ms;");
    });

    it("never shimmers: nothing in the Reader's sheets animates or transitions background-position", () => {
        for (const path of SHEETS) {
            const text = sheet(path);
            const animated = [...text.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].some((m) => /background-position/.test(m[1]));
            const transitioned = [...text.matchAll(/transition:\s*([^;]+);/g)].some((m) => /background-position/.test(m[1]));
            expect({ path, shimmer: animated || transitioned }).toEqual({ path, shimmer: false });
        }
    });

    it("holds the ink still and half-faint under reduced motion, and the dot appears at once", () => {
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".zettelkasten-flow__reader-ink-wait")));
        expect(reduced).toMatch(/\.zettelkasten-flow__reader-ink-wait span \{\s*animation: none;\s*opacity: 0\.5;/);
        expect(reduced.slice(0, reduced.indexOf("\n}"))).toContain(".zettelkasten-flow__reader-bar-dot");
    });

    it("fades the Alongside dot on opacity alone, at the fast beat", () => {
        const at = css.indexOf(".zettelkasten-flow__reader-bar-dot {");
        const block = css.slice(at, css.indexOf("\n}", at));
        expect(block).toContain("transition: opacity $motion-fast $ease-out;");
    });
});

describe("the overview is a camera, never a swap (#776 AC-15)", () => {
    const css = sheet("components/readerSource.scss");

    it("moves its cards in and its pictures in by transform and opacity only", () => {
        const frames = [...css.matchAll(/@keyframes\s+(zf-reader-overview[\w-]*)\s*\{([\s\S]*?)\n\}/g)];
        expect(frames.map((m) => m[1]).sort()).toEqual(["zf-reader-overview-arrive", "zf-reader-overview-in"]);
        for (const frame of frames) {
            const props = [...frame[2].matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
            expect(props.every((prop) => prop === "transform" || prop === "opacity")).toBe(true);
        }
    });

    it("is instant under reduced motion: the arrival, the fade and the tall sheet", () => {
        const own = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
        expect(own).toContain(".zettelkasten-flow__reader-overview--arriving");
        expect(own).toContain(".zettelkasten-flow__reader-overview-picture--drawn");
        const reader = sheet("components/reader.scss");
        const reduced = [...reader.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
        expect(reduced).toContain(".zettelkasten-flow__reader-panel--tall,");
        expect(reduced).toContain(".zettelkasten-flow__reader-overview-picture {");
    });

    it("pinches the page by a transform only, never a size", () => {
        const reader = sheet("components/reader.scss");
        const rule = reader.slice(reader.indexOf(".zettelkasten-flow__reader-stage--pinching {"));
        const body = rule.slice(0, rule.indexOf("}"));
        expect(body).toContain("scale: var(--zf-pinch-s, 1);");
        expect(body).not.toMatch(/\b(width|height|zoom)\s*:/);
    });

    it("keeps its card picture to a grid of transforms: the preview is scaled, never laid out small", () => {
        const preview = css.slice(css.indexOf(".zettelkasten-flow__reader-overview-preview {"));
        expect(preview.slice(0, preview.indexOf("\n}\n"))).toContain("transform: scale(var(--zf-card-scale, 0.16));");
    });
});

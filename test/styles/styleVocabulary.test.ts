import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");
const COMPONENTS = join(STYLES, "components");

/**
 * **The shape is said once** (#546 A1/A2, §XV).
 *
 * The audit found the root cause of "fifty stylesheets that do not read as one product":
 * `utils/variables.scss` and `utils/mixins.scss` were **empty files that `main.scss` imported**.
 * There had never been a place where *"a chip looks like this"* was said, so thirteen partials each
 * answered it again — three radii, four paddings, two hovers, and an active state that was the
 * accent in one file and a border in another.
 *
 * These are the rules that keep the answer in one place. They are deliberately about the
 * **vocabulary**, not about taste: the look is Obsidian's (§III), and what is enforced here is that
 * a shape has one definition rather than thirteen.
 */
function partials(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) partials(full, out);
        else if (entry.endsWith(".scss")) out.push(full);
    }
    return out;
}

const nameOf = (file: string): string => file.split(/[\\/]/).pop() as string;
const read = (file: string): string => readFileSync(file, "utf8");

describe("the vocabulary exists, and is not an empty file nobody noticed", () => {
    it("has tokens, and every one of them is an alias for a theme variable", () => {
        const tokens = read(join(STYLES, "utils", "variables.scss"));
        expect(tokens.trim().length).toBeGreaterThan(0);

        // Every `$token: value` reads a `var(--…)`, with one named exception: a pill radius, which
        // no Obsidian variable expresses and which is written in `em` so it still follows the
        // theme's font size. Anything else would be this plugin inventing a number the user's
        // theme has no say in.
        const declarations = [...tokens.matchAll(/^\$([\w-]+):\s*([^;]+);/gm)];
        expect(declarations.length).toBeGreaterThan(10);
        const invented = declarations
            .filter(([, , value]) => !value.includes("var(--"))
            .map(([, name, value]) => `${name}: ${value.trim()}`);
        expect(invented).toEqual(["radius-pill: 1em"]);
    });

    it("has the five shapes the audit counted, as mixins", () => {
        const mixins = read(join(STYLES, "utils", "mixins.scss"));
        for (const shape of ["chip", "chip-active", "chip-clickable", "card", "row", "hint", "empty-state"]) {
            expect(mixins).toContain(`@mixin ${shape}`);
        }
    });
});

describe("a chip is drawn by the mixin, not redefined per file (#546 A2)", () => {
    const files = partials(COMPONENTS);

    it("reads every partial, not a corner of them", () => {
        expect(files.length).toBeGreaterThan(40);
    });

    it("has no pill radius written out by hand anywhere", () => {
        // `border-radius: 999px` was the tell: seven files drew the same pill with the same magic
        // number. The pill is `$radius-pill` now, and it is expressed in `em` so it follows the
        // font size the theme chose.
        const offenders = files
            .filter((file) => /border-radius:\s*999px/.test(read(file)))
            .map(nameOf);
        expect(offenders).toEqual([]);
    });

    it("has every chip block include the shared shape", () => {
        // A class that **is** a chip and sets its own border *and* radius is a fourteenth
        // implementation being born. A class that is a **part** of one -- `chip-label`,
        // `chip-tooltip` -- is not a chip and is left alone: the name ends at `chip`, optionally
        // with a modifier.
        const offenders: string[] = [];
        for (const file of files) {
            const source = read(file);
            for (const [, selector, body] of source.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
                const isChip = selector
                    .split(",")
                    .some((one) => /chip(--[\w-]+)?\s*$/.test(one.trim()));
                if (!isChip) continue;
                const ownShape = /border:\s/.test(body) && /border-radius:/.test(body);
                if (ownShape && !body.includes("@include chip")) offenders.push(`${nameOf(file)}: ${selector.trim()}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("says 'this one is on' with one pair of colours", () => {
        // `chip-active` is the only place a chip turns into the accent. A file that sets both the
        // accent background and the on-accent text on a chip is saying it a second way.
        const offenders: string[] = [];
        for (const file of files) {
            const source = read(file);
            const blocks = [...source.matchAll(/\.[\w-]*(chip|badge|role|fact)[\w-]*[^{]*\{([^}]*)\}/g)];
            for (const [, , body] of blocks) {
                const paintsAccent =
                    body.includes("var(--interactive-accent)") && body.includes("var(--text-on-accent)");
                if (paintsAccent && !body.includes("@include chip-active")) offenders.push(nameOf(file));
            }
        }
        expect(offenders).toEqual([]);
    });
});

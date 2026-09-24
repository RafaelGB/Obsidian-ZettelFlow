import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");

/**
 * **The 4-pixel grid** (§XV, and Obsidian's own spacing reference).
 *
 * *"Obsidian uses a 4-pixel grid to structure UI elements"* — exposed as `--size-4-1` … `--size-4-18`,
 * with `--size-2-*` "sparingly and only when you need more fine-grained spacing". A partial that
 * writes `padding: 8px` is not wrong by four pixels; it is opting out of the scale the user's theme
 * is tuned against, and out of whatever that theme does to the scale.
 *
 * Its sibling `themeColours.test.ts` already holds the **colour** half of §XV, and holds it at
 * zero outside the 3D graph's own palette. This is the half nobody was guarding: **611 literals
 * across 44 partials** on the day the rule was written.
 *
 * A **ratcheting ceiling** — the mirror of the coverage floor in `jest.config.js`. These numbers may
 * only go **down**: a new off-grid pixel fails the build, and cleaning ten of them is a smaller diff
 * than the ceiling it lowers. A genuine pixel (a hairline, a sprite, a WebGL dimension) is allowed
 * and says why in a comment — which also takes it out of this count.
 */
const OFF_GRID = /[^-\w.](\d+)px/g;

/**
 * What each partial held on 2026-09-23. Lower these as files are cleaned; never raise one.
 *
 * Four of them came down the same day the vocabulary landed (#546 A2): the six chip
 * implementations became one mixin, and a shape defined once is a shape with one set of pixels.
 */
const CEILING: Record<string, number> = {
    "accordion.scss": 13,
    "actionAddMenu.scss": 56,
    "agencyReview.scss": 3,
    "animations.scss": 1,
    "askGraph.scss": 2,
    "backlink.scss": 1,
    "codeEditor.scss": 15,
    "community.scss": 29,
    "companionPane.scss": 5,
    "conceptNav.scss": 2,
    "cultivate.scss": 15,
    "discoveries.scss": 1,
    "dragAndDrop.scss": 1,
    "dynamicSelector.scss": 10,
    "evidenceMap.scss": 2,
    "evolutionTimeline.scss": 2,
    "flowStatus.scss": 2,
    "flows.scss": 4,
    "graph3d.scss": 10,
    "historyView.scss": 28,
    "home.scss": 6,
    "hooksConfig.scss": 94,
    "input.scss": 5,
    "knowledgeBalance.scss": 1,
    "knowledgeDashboard.scss": 2,
    "knowledgeDebt.scss": 4,
    "knowledgeMap.scss": 1,
    // 137 → 120: the blind block moved to askGraph.scss with #576, and went on the grid on
    // the way out rather than arriving as seventeen new off-grid pixels somewhere else.
    "lab.scss": 120,
    "main.scss": 29,
    "modal.scss": 10,
    "openQuestions.scss": 1,
    "progressBar.scss": 2,
    "reasoningPaths.scss": 3,
    "search.scss": 7,
    "selectableSearch.scss": 11,
    "selector.scss": 11,
    "slipboxHealth.scss": 1,
    "stepBuilder.scss": 9,
    "surface.scss": 1,
    "thinkingHeatmap.scss": 8,
    "walkStatus.scss": 6,
    // The one genuine pixel in the vocabulary: `$line-quiet` is a **hairline**, which the rule
    // above allows by name. It is declared here rather than left to slip in unnoticed, and it is
    // the only entry in this table that is not debt.
    "variables.scss": 1,
    "welcome.scss": 1,
    "workbench.scss": 7,
    "workflowCanvas.scss": 26,
};

function partials(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) partials(full, out);
        else if (entry.endsWith(".scss")) out.push(full);
    }
    return out;
}

/** A comment styles nothing, so a rule about styling should not count one. */
function styling(source: string): string {
    const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
    return withoutBlocks
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("//"))
        .join(" ");
}

function offGrid(source: string): number {
    return (styling(source).match(OFF_GRID) ?? []).length;
}

function nameOf(file: string): string {
    return file.split(/[\\/]/).pop() as string;
}

describe("padding comes from the grid, and no new pixel leaves it (§XV)", () => {
    const files = partials(STYLES);

    it("reads every partial, not a corner of them", () => {
        expect(files.length).toBeGreaterThan(40);
    });

    it("holds each one at or under its ceiling", () => {
        const over: string[] = [];
        for (const file of files) {
            const found = offGrid(readFileSync(file, "utf8"));
            const ceiling = CEILING[nameOf(file)] ?? 0;
            if (found > ceiling) over.push(`${nameOf(file)}: ${found} off-grid, ceiling ${ceiling}`);
        }
        // `padding: 8px` is `var(--size-4-2)`. Which variable means what is in
        // docs/development/obsidian-styling.md.
        expect(over).toEqual([]);
    });

    it("keeps the ceilings honest, so the ratchet cannot become a licence", () => {
        const slack: string[] = [];
        for (const file of files) {
            const ceiling = CEILING[nameOf(file)];
            if (ceiling === undefined) continue;
            const found = offGrid(readFileSync(file, "utf8"));
            if (found < ceiling) slack.push(`${nameOf(file)}: ${found} < ${ceiling} — lower the ceiling`);
        }
        expect(slack).toEqual([]);
    });

    it("counts a value, and not a comment or a word that ends in px", () => {
        expect(offGrid("padding: 8px;")).toBe(1);
        expect(offGrid("// 8px used to be here")).toBe(0);
        expect(offGrid("/* 8px */")).toBe(0);
        expect(offGrid(".thing--8px { color: red; }")).toBe(0);
    });
});

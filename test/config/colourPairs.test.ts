import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// test/config → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const STYLES = join(ROOT, "src", "styles");

/**
 * A colour pair is not something to remember (#431).
 *
 * Filling an element with an **accent** background and leaving the foreground to inherit is how the
 * step editor's actions list became unreadable until you hovered it: the header set
 * `background-color: var(--color-accent)` and no `color`, so the action's type — a link — fell back
 * to `--text-accent`, the same hue family. #406 had removed the inline `color: inherit` that was
 * papering over it, stating it moved to a class, and the rule was never written.
 *
 * Taste cannot be linted, but **this** can: a strong background without a stated foreground.
 */
function scssFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...scssFiles(full));
        else if (entry.name.endsWith(".scss")) out.push(full);
    }
    return out;
}

/** Backgrounds that carry their own foreground expectation. */
const STRONG_BACKGROUND =
    /background(?:-color)?:\s*var\(--(?:color-accent|interactive-accent|background-modifier-error)[^)]*\)/;

/**
 * Declaration blocks. A **nested** SCSS block captures its parent's declarations in the same group,
 * and those parents already state their colour — so a capture carrying a `;` is not a selector, and
 * it is skipped rather than reported as a defect.
 */
function blocks(source: string): { selector: string; body: string }[] {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map((match) => ({
            selector: match[1].trim().replace(/\s+/g, " "),
            body: match[2],
        }))
        .filter((block) => !block.selector.includes(";"));
}

describe("a strong background states its foreground (#431)", () => {
    it("scans the stylesheets", () => {
        expect(scssFiles(STYLES).length).toBeGreaterThan(20);
    });

    it("never fills with an accent and leaves the text to chance", () => {
        const offenders: string[] = [];
        for (const file of scssFiles(STYLES)) {
            for (const block of blocks(readFileSync(file, "utf8"))) {
                if (!STRONG_BACKGROUND.test(block.body)) continue;
                if (/(^|[;\s])color:/.test(block.body)) continue;
                offenders.push(`${relative(ROOT, file)} → ${block.selector}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

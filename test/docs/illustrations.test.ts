import { describe, it, expect } from "@jest/globals";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// test/docs → 2 ups → repo root
const DOCS = join(__dirname, "..", "..", "docs");
const RESOURCES = join(DOCS, "resources");

/**
 * **The house palette** is whatever the README's own drawings use: the union of every hex `fill`
 * and `stroke` in `docs/resources/readme/*.svg`. Recolour those and the palette follows — one house
 * style, never a second list to keep in step.
 */
const HEX = /(?:fill|stroke|stop-color)\s*[=:]\s*"?(#[0-9a-fA-F]{3,8})\b/g;
const colours = (svg: string) => [...svg.matchAll(HEX)].map((match) => match[1].toLowerCase());
const PALETTE = new Set(
    readdirSync(join(RESOURCES, "readme"))
        .filter((file) => file.endsWith(".svg"))
        .flatMap((file) => colours(readFileSync(join(RESOURCES, "readme", file), "utf8")))
);

/**
 * The four drawings #800 adds (D12, FR-4, AC-6) and the two #804 adds, each with the page that
 * shows it. They are official, hand-drawn SVG — never a screenshot — and the Learn catalog (S4) points
 * at them, so each must exist, stay in the house style and be used by its page.
 */
const ILLUSTRATIONS: [svg: string, page: string][] = [
    ["collision/collision.svg", "architecture/collision.md"],
    ["undo/undo.svg", "architecture/reversibility.md"],
    ["hooks/property-hooks.svg", "vault-hooks/property-hooks/overview.md"],
    ["workbench/script-workbench.svg", "architecture/script-workbench.md"],
    // #804: the Community view — its four rooms on one strip, and the install shot.
    ["community/rooms.svg", "community/index.md"],
    ["community/install-shot.svg", "community/index.md"],
    // #836: the formats a PDF page keeps in the reading view.
    ["library/pdf-formats.svg", "development/library.md"],
    // #842: a marked PDF handed back as a copy with your notes.
    ["reader/share-copy.svg", "development/reader.md"],
    // #874: Think read by one source, in the book's order, with its spine.
    ["home/think-by-source.svg", "architecture/thought-lab.md"],
    // #875: Home, Cultivate and Think as one set, and the two doors.
    ["home/one-set.svg", "development/zettelflow-home.md"],
];

describe("the docs illustrations (#800 D12)", () => {
    it("derives a palette worth checking against", () => {
        expect(PALETTE.size).toBeGreaterThan(20);
    });

    it.each(ILLUSTRATIONS)("%s is drawn in the house style", (svg) => {
        const path = join(RESOURCES, svg);
        expect(existsSync(path)).toBe(true);
        const text = readFileSync(path, "utf8");
        expect(text).toMatch(/<svg[^>]*\sviewBox="[^"]+"/);
        expect(text).toMatch(/<svg[^>]*\saria-label="[^"]+"/);
        expect(text).not.toMatch(/<script/i);
        expect(text).not.toMatch(/<image[^>]*href\s*=\s*"https?:/i);
        expect(text).not.toMatch(/\son[a-z]+\s*=/i);
        const used = colours(text);
        expect(used.length).toBeGreaterThan(5);
        expect([...new Set(used)].filter((colour) => !PALETTE.has(colour))).toEqual([]);
    });

    it.each(ILLUSTRATIONS)("%s is shown by %s", (svg, page) => {
        const text = readFileSync(join(DOCS, page), "utf8");
        expect(text).toContain(`resources/${svg})`);
    });
});

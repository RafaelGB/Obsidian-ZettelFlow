import { describe, it, expect } from "@jest/globals";
import { join } from "path";
import { compile } from "sass";

/**
 * **Text a finger can select** (#886).
 *
 * Obsidian's `body` is `user-select: none; -webkit-user-select: none`, and every view of its own that
 * gives selection back says both. iOS WebKit resolves selection from the prefixed property only, so a
 * rule that says `user-select: text` alone works on every desktop and selects nothing on an iPad. The
 * bundle adds no prefix (esbuild, es2020): the stylesheet has to say it, and this holds it there.
 */
function blocks(css: string): { selector: string; body: string }[] {
    const out: { selector: string; body: string }[] = [];
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        out.push({ selector: match[1].trim(), body: match[2] });
    }
    return out;
}

const UNPREFIXED = /(^|[\s;])user-select:\s*text/;
const PREFIXED = /-webkit-user-select:\s*text/;

describe("text a finger can select (#886)", () => {
    const css = compile(join(__dirname, "..", "..", "src", "styles", "main.scss")).css;

    it("finds the rules that give selection back", () => {
        expect(blocks(css).filter((block) => UNPREFIXED.test(block.body)).length).toBeGreaterThan(3);
    });

    it("says -webkit-user-select: text wherever it says user-select: text", () => {
        const missing = blocks(css)
            .filter((block) => UNPREFIXED.test(block.body) && !PREFIXED.test(block.body))
            .map((block) => block.selector);
        expect(missing).toEqual([]);
    });
});

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The front door has a ceiling, and it only goes down (#588, FR-7 / AC-6).
 *
 * Measured at `2f6198f5`: `README.md` was **364 lines / 7,806 words**, and its `## Features` table
 * carried **69 body rows** — 56% of the file, a changelog in which nothing could be ranked. This is
 * the mirror of the coverage floor in `jest.config.js` and of the pixel ceiling in
 * `test/styles/themeGrid.test.ts`: the numbers below may only ever go **DOWN**. A README that grows
 * past them fails the build, and lowering a ceiling is a smaller diff than the paragraph nobody read.
 *
 * Counted in Node (not `wc` / `awk`) so it runs in CI, and CRLF-normalised so it reads the same on
 * every machine that checks it out.
 */
const CEILING = { lines: 200, words: 3500, tableRows: 25 };

const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), "g");
const LF = String.fromCharCode(10);
const README = readFileSync(join(__dirname, "..", "..", "README.md"), "utf8").replace(CRLF, LF);

/** A trailing newline is the format's, not a line of content. */
function lineCount(text: string): number {
    return text.replace(/\n$/, "").split("\n").length;
}

function wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

/** The longest markdown table's body-row count: a run of `|` lines, less its header + separator. */
function longestTableBodyRows(text: string): number {
    let max = 0;
    let run = 0;
    for (const line of text.split("\n")) {
        if (line.trimStart().startsWith("|")) run++;
        else {
            if (run > max) max = run;
            run = 0;
        }
    }
    if (run > max) max = run;
    // Header + separator + body; a run under two lines is not a table.
    return max >= 2 ? max - 2 : 0;
}

describe("the front door stays bounded (#588, AC-6)", () => {
    it("reads a real README, so the ceiling cannot pass vacuously", () => {
        expect(README.length).toBeGreaterThan(500);
    });

    it(`is at most ${CEILING.lines} lines`, () => {
        expect(lineCount(README)).toBeLessThanOrEqual(CEILING.lines);
    });

    it(`is at most ${CEILING.words} words`, () => {
        expect(wordCount(README)).toBeLessThanOrEqual(CEILING.words);
    });

    it(`has no single table over ${CEILING.tableRows} body rows`, () => {
        expect(longestTableBodyRows(README)).toBeLessThanOrEqual(CEILING.tableRows);
    });
});

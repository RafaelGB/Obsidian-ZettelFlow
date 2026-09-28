import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { FROZEN_PRIVACY_BULLETS } from "./privacyBullets";

/**
 * The content contract of the two front-door artifacts (#588, AC-3 / AC-5 / AC-7 / AC-8).
 *
 * The reader test (AC-2) is the acceptance; these are its mechanical residue, so a later regression
 * fails CI without needing a human reader. Five groups: the four loops are on the first screen and
 * linked (AC-3), `docs/index.md` is a map and not a second inventory (AC-5), every relative link
 * resolves (AC-7), and nothing shipped is called planned while the disclosure is intact (AC-8).
 */
const ROOT = join(__dirname, "..", "..");
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), "g");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(CRLF, "\n");
const README = read("README.md");
const INDEX = read("docs/index.md");

const FIRST_SCREEN = README.split("\n").slice(0, 60);
const firstScreenText = FIRST_SCREEN.join("\n");

/**
 * The four practice loops the first screen must name, each with the page it links to. Never one
 * combined `grep -c`: the spec's original `grep -icE 'wager|collision|claim|move'` returned 4 at
 * `2f6198f5` (it counts matching lines), so it was green at the very commit whose failure this issue
 * exists to fix. Four independent assertions cannot be fooled that way.
 */
const LOOPS = [
    { label: "the return of a claim", re: /return of a claim/i, target: "docs/development/claim-returns.md" },
    { label: "collision", re: /two things far apart|collision/i, target: "docs/architecture/collision.md" },
    { label: "a wager", re: /wager/i, target: "docs/development/wagers.md" },
    { label: "cognitive moves", re: /make a move|cognitive move/i, target: "docs/development/cultivate.md" },
];

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
    return max >= 2 ? max - 2 : 0;
}

/** Relative link targets in a markdown file, resolved against the file's own directory. */
function relativeLinkTargets(markdownAbsPath: string, text: string): string[] {
    const dir = dirname(markdownAbsPath);
    const targets: string[] = [];
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        let href = match[1].trim();
        if (/^(https?:|mailto:|#)/.test(href)) continue;
        href = href.split("#")[0].split("?")[0];
        if (!href) continue;
        targets.push(join(dir, href));
    }
    return targets;
}

describe("group 1 — the first screen names the four practice loops (#588, AC-3)", () => {
    for (const loop of LOOPS) {
        it(`names ${loop.label} in the first 60 lines`, () => {
            expect(loop.re.test(firstScreenText)).toBe(true);
        });
    }
});

describe("group 2 — each loop on the first screen links to its own page (#588, AC-3)", () => {
    for (const loop of LOOPS) {
        it(`links ${loop.label} to ${loop.target}, which exists`, () => {
            const line = FIRST_SCREEN.find((l) => loop.re.test(l) && l.includes(`](${loop.target}`));
            expect({ loop: loop.label, linked: line !== undefined }).toEqual({ loop: loop.label, linked: true });
            expect(existsSync(join(ROOT, loop.target))).toBe(true);
        });
    }
});

describe("group 3 — docs/index.md is the map, not a second inventory (#588, AC-5)", () => {
    it("has no ## Feature overview heading", () => {
        expect(INDEX).not.toMatch(/^## Feature overview/m);
    });

    it("keeps every table small — the ceiling applies to the map too", () => {
        expect(longestTableBodyRows(INDEX)).toBeLessThanOrEqual(6);
    });
});

describe("group 4 — every relative link resolves (#588, AC-7)", () => {
    it("README.md points at nothing missing", () => {
        const broken = relativeLinkTargets(join(ROOT, "README.md"), README).filter((p) => !existsSync(p));
        expect(broken).toEqual([]);
    });

    it("docs/index.md points at nothing missing", () => {
        const broken = relativeLinkTargets(join(ROOT, "docs", "index.md"), INDEX).filter((p) => !existsSync(p));
        expect(broken).toEqual([]);
    });
});

describe("group 5 — nothing shipped is called planned, and the disclosure is intact (#588, AC-8)", () => {
    it("makes no issue link inside a sentence that calls it proposed/planned/pending", () => {
        const offenders = README.split(/(?<=[.!?])\s+/).filter(
            (sentence) =>
                /issues\/\d+/.test(sentence) &&
                /\b(proposed|planned|pending|upcoming|not proven)\b/i.test(sentence)
        );
        expect(offenders).toEqual([]);
    });

    it("does not carry the 'proposed Knowledge with purpose epic' sentence", () => {
        expect(README.replace(/\s+/g, " ")).not.toContain("proposed [Knowledge with purpose");
    });

    it("keeps every privacy-disclosure bullet, whitespace-collapsed", () => {
        const collapsed = README.replace(/\s+/g, " ");
        const missing = FROZEN_PRIVACY_BULLETS.filter((bullet) => !collapsed.includes(bullet));
        expect(missing).toEqual([]);
    });
});

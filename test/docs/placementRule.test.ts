import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The rule that places a capability is written down, and stays written down (#588, FR-6 / AC-9).
 *
 * AC-9 was specified as prose, and it is the most durable part of this change — the one thing that
 * stops the 69-row changelog growing back — and so the easiest to quietly re-soften later. It gets a
 * test. Both harness files must route a capability by its **door rank** (first screen / headline
 * entry / one line in the generated reference), and neither may still tell the author to *add a row
 * to the Features table*, the instruction that produced the failure this issue exists to fix.
 */
const ROOT = join(__dirname, "..", "..");
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), "g");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(CRLF, "\n");

const FILES = [
    { name: "CLAUDE.md", text: read("CLAUDE.md") },
    { name: ".claude/skills/implement/SKILL.md", text: read(".claude/skills/implement/SKILL.md") },
];

/** The three routes, keyed by door rank, that must appear in both files. */
const ROUTES = ["door rank", "first screen", "headline entry", "one line in the generated capability reference"];

describe("a capability is placed by its door rank (#588, FR-6 / AC-9)", () => {
    for (const file of FILES) {
        it(`${file.name} routes placement by door rank, with all three routes`, () => {
            const missing = ROUTES.filter((phrase) => !file.text.includes(phrase));
            expect({ file: file.name, missing }).toEqual({ file: file.name, missing: [] });
        });

        it(`${file.name} no longer says "add a row to the Features table"`, () => {
            // Whitespace-collapsed, so a line-wrapped "**Features**\n  table" is still caught.
            expect(file.text.replace(/\s+/g, " ")).not.toContain("add a row to the **Features** table");
        });
    }
});

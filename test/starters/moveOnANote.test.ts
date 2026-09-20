import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { MOVE_VERBS } from "application/thinking/move";

// test/starters → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const COMMANDS = read("src/starters/zcomponents/MoveCommandsComponent.ts");
const CULTIVATE = read("src/architecture/components/core/cultivate/CultivateModeRenderer.ts");
const STARTERS = read("src/starters/utils/StartersTools.ts");
/**
 * Comments stripped, line-based. A rule about what the code must not reach has to be judged on
 * the code: the doc comment explaining *why* `setSubmenu` is avoided says the word, and would
 * otherwise fail the test it describes. (Third time this trap has been sprung in this epic.)
 */
function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

const EN = read("src/architecture/lang/locale/en.ts");
const ES = read("src/architecture/lang/locale/es.ts");

/**
 * **A move on a note** (#493, epic #489).
 *
 * The transversal half. Challenging an idea and finding a counterexample are as useful against a
 * permanent note as against a raw thought, and leaving them inside the Lab stranded half the
 * product.
 *
 * Two promises carry the feature, and both are asserted structurally because a command cannot be
 * invoked in a node environment: **one gesture, never a form**, and **the note is never written
 * to**.
 */

describe("every verb is one gesture on the active note (#493)", () => {
    it("registers one command per verb, from the vocabulary rather than a second list", () => {
        expect(COMMANDS).toContain("for (const entry of MOVE_VERBS)");
        expect(COMMANDS).toContain("id: `move-${entry.verb}`");
        expect(MOVE_VERBS).toHaveLength(11);
    });

    it("gates them on an active markdown note, so the palette stays honest", () => {
        expect(COMMANDS).toContain("checkCallback");
        expect(COMMANDS).toContain('file.extension !== "md"');
    });

    it("acknowledges the move the moment it lands", () => {
        expect(COMMANDS).toContain("new Notice(");
        expect(COMMANDS).toContain("move_recorded");
    });
});

describe("no form stands between you and a move (#493)", () => {
    it("opens no modal, anywhere in the path", () => {
        // If naming a move took longer than making one, nobody would ever make one.
        expect(code(COMMANDS)).not.toMatch(/new\s+\w*Modal\(/);
        expect(code(COMMANDS)).not.toContain("prompt(");
        expect(code(CULTIVATE)).toContain("recordMoveOn(");
    });

    it("reaches no internal Obsidian API for a nested menu", () => {
        // `MenuItem.setSubmenu()` exists at runtime and is not in the typings. This plugin already
        // carries one unavoidable internal dependency (the canvas patcher); a right-click
        // convenience does not justify a second.
        expect(code(COMMANDS)).not.toContain("setSubmenu");
        expect(code(COMMANDS)).not.toContain("as unknown as");
    });
});

describe("the note is never written to (#493)", () => {
    it("reaches no writer at all", () => {
        // A move is a fact about what you did, not an edit. Nothing here can touch the note, so
        // the write record has nothing to show — which is the assertion, made at the source.
        for (const source of [code(COMMANDS), code(CULTIVATE)]) {
            expect(source).not.toMatch(/FrontmatterService|processFrontMatter|\.modify\(/);
        }
        expect(code(COMMANDS)).not.toContain("FileService");
    });
});

describe("Cultivate is the in-context door (#493)", () => {
    it("offers the moves on the note it is already showing", () => {
        expect(CULTIVATE).toContain("renderMoveRow(");
        expect(CULTIVATE).toContain("recordMoveOn(verb, path)");
        expect(CULTIVATE).toContain("MOVE_VERBS");
    });

    it("is wired into the plugin", () => {
        expect(STARTERS).toContain("new MoveCommandsComponent(plugin)");
    });
});

describe("the vocabulary reads as language, in both locales (#493)", () => {
    it("names every verb, and names it as something you would say", () => {
        for (const [name, locale] of [["en", EN], ["es", ES]] as const) {
            const missing = MOVE_VERBS.filter((verb) => !locale.includes(`${verb.labelKey}:`)).map((v) => v.verb);
            expect({ locale: name, missing }).toEqual({ locale: name, missing: [] });
        }
    });

    it("keeps the keys greppable, so the locale guardrail can see them", () => {
        // They were derived from the verb once. Neat, and invisible to the scan that proves every
        // shipped string is actually rendered — eleven real strings looked like eleven orphans.
        const source = read("src/application/thinking/move.ts");
        for (const verb of MOVE_VERBS) expect(source).toContain(`"${verb.labelKey}"`);
    });
});

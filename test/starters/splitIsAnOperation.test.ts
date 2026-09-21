import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { effectOf } from "application/thinking/move";

// test/starters → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const COMPONENT = read("src/starters/zcomponents/AtomicitySplitComponent.ts");
const MODAL = read("src/zettelkasten/modals/AtomicitySplitModal.ts");
const COMMANDS = read("src/starters/zcomponents/MoveCommandsComponent.ts");

/**
 * **Split is an operation you already have** (#501, epic #497).
 *
 * Ten of the eleven verbs are things only you can do: nobody can write your counterexample. One
 * is not. Splitting a note at its headings **invents nothing** — it rearranges what you already
 * wrote — and ZettelFlow has done it since long before this epic.
 *
 * That makes it the proof that the §XII line is a line rather than a refusal to do anything: an
 * operation derivable from what you wrote runs, and the move records the provenance of a real
 * transformation instead of an intention.
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

describe("one implementation, two doors (#501)", () => {
    it("the command keeps its id and now calls the shared function", () => {
        expect(code(COMPONENT)).toContain('id: "split-note-into-atomic-notes"');
        expect(code(COMPONENT)).toContain("await splitNote(this.plugin.app, file)");
    });

    it("there is exactly one place that opens the split modal", () => {
        expect((code(COMPONENT).match(/new AtomicitySplitModal\(/g) ?? [])).toHaveLength(1);
        expect(code(COMMANDS)).not.toContain("AtomicitySplitModal");
        expect(code(COMMANDS)).not.toContain("parseNote");
    });

    it("acts on the note the move was made on, not on whatever is in the editor", () => {
        // A right-click in the file explorer must not split the note you are reading.
        expect(code(COMMANDS)).toContain("this.plugin.app.vault.getAbstractFileByPath(path)");
        expect(code(COMMANDS)).toContain("splitNote(this.plugin.app, file,");
        const fn = code(COMPONENT).slice(code(COMPONENT).indexOf("export async function splitNote"));
        expect(fn).not.toContain("getActiveViewOfType");
    });
});

describe("it records a transformation, not an intention (#501)", () => {
    it("the vocabulary says this verb runs something", () => {
        expect(effectOf("split", "note")).toBe("operation");
    });

    it("records only when notes were actually created", () => {
        // Cancelled, or fewer than two sections, and nothing happened — so nothing is recorded.
        const apply = code(MODAL).slice(code(MODAL).indexOf("this.onDone?."));
        expect(apply.slice(0, 80)).toContain("this.onDone?.(plans.length)");
        const fn = code(COMPONENT).slice(code(COMPONENT).indexOf("export async function splitNote"));
        // From the body, not the signature — which names `onDone` and would match trivially.
        const early = fn.slice(fn.indexOf("{"), fn.indexOf("new AtomicitySplitModal"));
        expect(early).toContain("atomicity_nothing_to_split");
        expect(early).not.toContain("onDone");
    });

    it("hands the move in as the callback, so the recording is the split's own completion", () => {
        expect(code(COMMANDS)).toContain("() => recordMoveOn(verb, path)");
    });
});

describe("the split's own writes are unchanged (#501)", () => {
    it("still goes through FileService", () => {
        expect(code(MODAL)).toContain("FileService");
        expect(code(MODAL)).not.toMatch(/vault\.(create|modify|delete)\(/);
    });
});

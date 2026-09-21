import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { effectOf, verbsFor } from "application/thinking/move";

// test/architecture/components → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const COMMANDS = read("src/starters/zcomponents/MoveCommandsComponent.ts");
const HOME = read("src/architecture/components/core/surface/HomeSurfaceView.ts");
const LAB = read("src/architecture/components/core/lab/LabRenderer.ts");
const PICKER = read("src/architecture/components/core/moves/MovePicker.ts");
const THOUGHT = read("src/application/thinking/thought.ts");

/**
 * **A move opens the space it needs** (#499, epic #497).
 *
 * Challenging a note recorded a verb and left you with nothing you did not have. On a *thought*
 * this always worked — the Lab arms the composer and you write — and the note side got the
 * vocabulary without the space. One value travels to close that: the **frame**.
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

describe("a framed verb opens the thinking space (#499)", () => {
    it("routes by what the vocabulary says the verb does, not by a list here", () => {
        expect(code(COMMANDS)).toContain('const effect = effectOf(verb.verb, "note");');
        expect(code(COMMANDS)).toContain('if (effect === "space")');
        expect(code(COMMANDS)).toContain('activateSurface(this.plugin.app, "zettelflow-home", "lab", { about: path, frame: verb.verb })');
    });

    it("carries the frame through the same seam the subject already uses", () => {
        expect(code(HOME)).toContain('typeof state?.frame === "string"');
        expect(code(LAB)).toContain("private frame?: string");
    });

    it("names the verb and the note in the place you are about to type", () => {
        expect(code(LAB)).toContain("composerPlaceholder()");
        expect(code(LAB)).toContain("lab_framed_placeholder");
    });

    it("offers only what means something on a note", () => {
        const offered = verbsFor("note").map((verb) => verb.verb);
        expect(offered).toContain("challenge");
        expect(offered).not.toContain("crystallize");
        expect(effectOf("challenge", "note")).toBe("space");
        expect(code(PICKER)).toContain("verbsFor(this.subject)");
    });
});

describe("the frame is a frame, not a data model (#499)", () => {
    it("did not grow the response union", () => {
        // Eleven frames must not become eleven kinds of edge. This is the one place in the epic
        // where growing the data model would look reasonable and be very hard to undo.
        expect(code(THOUGHT)).toContain('export type ResponseKind = "fork" | "challenge";');
    });

    it("is consumed once, so the next thought is not still framed", () => {
        const commit = code(LAB).slice(code(LAB).indexOf("private async commit()"));
        expect(commit.slice(0, commit.indexOf("\n    }"))).toContain("this.frame = undefined;");
    });
});

describe("it writes nothing, and composes nothing (#499)", () => {
    it("reaches no writer from the picker path", () => {
        expect(code(COMMANDS)).not.toMatch(/FileService|FrontmatterService|processFrontMatter/);
    });

    it("never drafts a sentence for you", () => {
        // The system provides the frame; you provide the content. A generated formulation would
        // be interpretive output needing a §XII gate — and a worse product, because your
        // inversion is the thinking.
        for (const source of [code(COMMANDS), code(PICKER), code(LAB)]) {
            expect(source).not.toMatch(/\bZfAi\b|requestUrl|\bfetch\(/);
        }
        // The frame reaches the composer as a placeholder, never as a value.
        expect(code(LAB)).not.toMatch(/area\.value\s*=\s*t\(/);
    });
});

import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const APPLIER = readFileSync(
    join(SRC, "architecture", "plugin", "thinking", "crystallizeThought.ts"),
    "utf8"
);
const MODAL = readFileSync(
    join(SRC, "architecture", "components", "core", "lab", "CrystallizeModal.ts"),
    "utf8"
);

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * Crystallization is the §XII verdict (#468).
 *
 * The constitution requires that interpretive output reach the vault only through an explicit
 * human accept/modify/reject, recorded. In the rest of the product that is a guardrail on AI;
 * here it is the central mechanic, so the guardrail has to be about **who is allowed to call it**.
 */
describe("nothing crystallizes by itself (#468)", () => {
    it("is called from exactly one place, and that place is a confirmation", () => {
        const callers = sources(SRC)
            .filter((path) => !path.endsWith("crystallizeThought.ts"))
            .filter((path) => /\bcrystallize\(/.test(readFileSync(path, "utf8")))
            .map((path) => relative(SRC, path));
        expect(callers).toEqual([join("architecture", "components", "core", "lab", "CrystallizeModal.ts")]);
    });

    it("has that one caller behind a button you press, not a lifecycle hook", () => {
        expect(MODAL).toContain("setButtonText(t(\"crystallize_confirm\"))");
        expect(MODAL).toContain("onClick(() => void this.apply())");
        // Nothing that could fire it unattended.
        for (const automatic of ["onLayoutReady", "registerEvent", "setInterval", "onload("]) {
            expect({ automatic, used: MODAL.includes(automatic) }).toEqual({ automatic, used: false });
        }
    });

    it("reaches no AI, so the door cannot be opened by a suggestion", () => {
        for (const path of [APPLIER, MODAL]) {
            for (const ai of ["architecture/ai", "askAi", "completion"]) {
                expect(path.includes(ai)).toBe(false);
            }
        }
    });

    it("records the verdict in the one log every verdict goes to", () => {
        expect(APPLIER).toContain("JudgementLog.getInstance().record(");
        expect(APPLIER).toContain('origin: "human"');
        expect(APPLIER).toContain('verdict: "accepted"');
        // Subject only — the log must never carry note content (#336).
        expect(APPLIER).toContain("subject: `crystallize:");
        expect(APPLIER).not.toContain("note: request.body");
    });

    it("writes the note through the ordinary seam, so it can be taken back", () => {
        expect(APPLIER).toContain("FileService.createFile(");
        expect(APPLIER).toContain("withWriteBatch(");
    });

    it("never deletes, moves or locks the thoughts it came from", () => {
        // A door that eats the room behind it is not a door: the same chaos can produce a second
        // idea next month.
        for (const consuming of ["deleteFile", "moveFile", "trashFile", "ThoughtStore"]) {
            expect({ consuming, used: APPLIER.includes(consuming) }).toEqual({ consuming, used: false });
        }
    });
});

/**
 * Going back to the note you came from (#474).
 *
 * A thread with a subject was a one-way street: you crossed over to think, worked something out,
 * and the only destination was a *new* note — leaving the one you came from as unfinished as when
 * you left it.
 */
describe("crystallizing back is an append, never a rewrite (#474)", () => {
    it("appends through the recorded seam, so it can be taken back", () => {
        expect(APPLIER).toContain("export async function crystallizeInto(");
        expect(APPLIER).toContain("FileService.appendTo(file, block)");
        expect(APPLIER).toContain('withWriteBatch({ kind: "manual", ref: "crystallize-back"');
        // Nothing that could touch what the note already says.
        for (const rewriting of ["FileService.modify", "FileService.writeFile", "setProperties"]) {
            expect({ rewriting, used: APPLIER.includes(rewriting) }).toEqual({ rewriting, used: false });
        }
    });

    it("records the same §XII verdict, naming the note it landed in", () => {
        expect(APPLIER).toContain("subject: `crystallize-back:");
        expect(APPLIER).toContain("path,");
    });

    it("refuses when the note is gone, instead of failing halfway", () => {
        expect(APPLIER).toContain("if (!(file instanceof TFile)) return undefined;");
        expect(MODAL).toContain('t("crystallize_subject_gone")');
    });

    it("does not guess where the thinking belongs when both destinations are open", () => {
        // Where a piece of thinking belongs is the decision; guessing it is how it ends up in
        // the wrong place.
        expect(MODAL).toContain("this.destination = this.choices()[0];");
        expect(MODAL).toContain('dropdown.addOption("back"');
        expect(MODAL).toContain('dropdown.addOption("new-note"');
    });

    it("still cannot be reached automatically", () => {
        for (const automatic of ["onLayoutReady", "registerEvent", "setInterval"]) {
            expect({ automatic, used: APPLIER.includes(automatic) }).toEqual({ automatic, used: false });
        }
    });
});

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

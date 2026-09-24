import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { CLAIM_SUBJECT_PREFIX, claimSubject } from "architecture/knowledge/claims";
import { recordJudgement } from "architecture/knowledge/judgement";

// test/architecture/knowledge/judgement → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * The verdict a stated claim records (#561, epic #558).
 *
 * The record is on by default because of what it does **not** hold: a path, a short subject id, an
 * origin and a verdict. A claim is a sentence, and the sentence is the one thing that must never
 * reach `data.json` — so this suite asserts the shape of the entry and scans the one module that
 * writes it.
 */
describe("a stated claim has a subject, and nothing else (#561)", () => {
    it("names the subject after the note it is about", () => {
        expect(CLAIM_SUBJECT_PREFIX).toBe("claim:");
        expect(claimSubject("Notes/a.md")).toBe("claim:Notes/a.md");
    });

    it("records one verdict carrying five fields and no text", () => {
        const at = 1_700_000_000_000;
        const path = "Notes/a.md";
        const log = recordJudgement([], {
            at,
            path,
            subject: claimSubject(path),
            origin: "human",
            verdict: "accepted",
        });
        expect(log).toHaveLength(1);
        expect(Object.keys(log[0]).sort()).toEqual(["at", "origin", "path", "subject", "verdict"]);
        expect(log[0].subject).toBe("claim:Notes/a.md");
        expect(JSON.stringify(log[0])).not.toContain("sentence");
    });

    it("never puts the sentence in the record, and never writes the note's body", () => {
        const source = read("src/architecture/plugin/claims/statedClaim.ts");
        // `note:` is the judgement's optional rationale field. A claim's rationale *is* the claim.
        expect(source).not.toMatch(/note:\s/);
        // The claim is a property. Nothing here touches content.
        expect(source).not.toMatch(/FileService\.(modify|appendTo|writeFile|createFile)/);
        expect(source).toContain("FrontmatterService.instance(file).update");
        expect(source).toContain("withWriteBatch");
    });
});

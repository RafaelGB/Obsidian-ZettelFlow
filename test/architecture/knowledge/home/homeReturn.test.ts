import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { dueClaims } from "architecture/knowledge/state";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";

// test/architecture/knowledge/home → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const HOME = read("src/architecture/components/core/home/HomeModeRenderer.ts");

/**
 * Comments stripped. A rule about what the interface must never say has to be judged on the
 * strings it renders — the comment explaining *why* there is no day count says the words, and
 * would otherwise fail the test it describes.
 */
const LINE_BREAK = String.fromCharCode(10);

function code(source: string): string {
    return source
        .split(LINE_BREAK)
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(LINE_BREAK);
}

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function idea(path: string, claim: string, modified: number): Idea {
    return {
        path,
        title: path,
        created: 0,
        modified,
        state: "fleeting",
        maturitySignals: { degree: 0, inbound: 0, outbound: 0, ageDays: 0, sourceCount: 0 },
        relations: [],
        claims: [{ text: claim, sources: [] }],
    } as unknown as Idea;
}

/**
 * One line, or none (#563 FR-5, FR-6).
 *
 * The front door is where a queue would do the most damage: an inbox greets you with how far behind
 * you are, which is the opposite of an invitation. So the rules are asserted on the renderer's
 * source, because a count is easiest to add in six months and a note in a review will not stop it.
 */
describe("Home offers one return, and never keeps score (#563)", () => {
    it("reaches the selection through the State surface", () => {
        expect(HOME).toContain("dueClaims");
        expect(HOME).toContain('from "architecture/knowledge/state"');
    });

    it("offers one line even when five claims are due", () => {
        const model = new KnowledgeModel();
        model.build([
            idea("Notes/a.md", "a", NOW - 100 * DAY),
            idea("Notes/b.md", "b", NOW - 300 * DAY),
            idea("Notes/c.md", "c", NOW - 200 * DAY),
            idea("Notes/d.md", "d", NOW - 150 * DAY),
            idea("Notes/e.md", "e", NOW - 120 * DAY),
        ]);
        expect(dueClaims({ model, intervalDays: 90, now: NOW })).toHaveLength(1);
    });

    it("draws nothing at all in a vault that has never said anything", () => {
        // Two branches, in this order: no claims anywhere is silence; claims but none due is one
        // quiet sentence. An empty box on the front door is a box you learn to skip (#516).
        const render = code(HOME).slice(code(HOME).indexOf("private renderClaimReturn"));
        const silence = render.indexOf("if (!this.claimsExist) return;");
        const quiet = render.indexOf('t("home_return_none")');
        const firstDraw = render.indexOf("createDiv");
        expect(silence).toBeGreaterThan(-1);
        expect(silence).toBeLessThan(firstDraw);
        expect(quiet).toBeGreaterThan(silence);
    });

    it("counts nothing in the line it draws", () => {
        const render = code(HOME).slice(
            code(HOME).indexOf("private renderClaimReturn"),
            code(HOME).indexOf("private renderOpenQuestions")
        );
        expect(render).not.toContain("tCount(");
        expect(render).not.toContain(".length");
        // The weekly review's stale hubs are a different thing with a confusingly similar name.
        expect(render).not.toContain("home_section_review_due");
    });

    it("says a month, never a number of days", () => {
        expect(HOME).toContain("toLocaleDateString");
        expect(code(HOME)).not.toContain("days ago");
    });
});

/**
 * Nothing in this issue writes to the vault (§VII).
 *
 * The door (#561) and the answers (#562) write; bringing a claim back does not. The negative is
 * worth a guardrail because the sweep runs unattended, and an unattended write is the one thing a
 * user cannot see happening.
 */
describe("bringing a claim back writes nothing (#563)", () => {
    const files = [
        "src/architecture/knowledge/review/dueClaims.ts",
        "src/architecture/plugin/events/reviewDue.ts",
        "src/architecture/plugin/claims/lastReviewedOf.ts",
        "src/config/modals/handlers/returnSettingsGroup.ts",
    ];

    it("touches no writer", () => {
        for (const file of files) {
            expect(read(file)).not.toMatch(/FrontmatterService|FileService|processFrontMatter|\.modify\(/);
        }
    });

    it("keeps the selection Obsidian-free", () => {
        expect(read("src/architecture/knowledge/review/dueClaims.ts")).not.toMatch(/from "obsidian"/);
    });

    it("scans the files it claims to scan", () => {
        for (const file of files) expect(statSync(join(ROOT, file)).isFile()).toBe(true);
        expect(readdirSync(join(ROOT, "src/architecture/knowledge/review"))).toContain("dueClaims.ts");
    });
});

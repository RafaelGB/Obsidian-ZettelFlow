import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// test/actions/ai → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const ACTIONS = join(ROOT, "src", "actions");

/**
 * [Constitution §XII](../../../docs/development/constitution.md) says interpretive output reaches the
 * vault only through an explicit human verdict. This is the guardrail that makes it enforceable rather
 * than aspirational (#337, FR-6).
 *
 * The line needs no new registry, because the existing taxonomy already draws it:
 * **interpretive == `category: "ai"`**. Everything else writes *mechanical* output — a gathered list, a
 * derived metric, a structural projection — and *metrics are consequences, not inventions*, so those
 * are facts. Facts do not need a verdict; unverifiable machine prose does.
 */
function actionFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...actionFiles(full));
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

const files = actionFiles(ACTIONS);
const aiActionFiles = files.filter((file) => /category\s*=\s*"ai"\s+as const/.test(readFileSync(file, "utf8")));

describe("every interpretive action goes through a verdict (#337, §XII)", () => {
    it("finds the AI-category actions", () => {
        expect(aiActionFiles.length).toBeGreaterThan(0);
    });

    it("each one routes through the shared verdict path, never writing on its own", () => {
        for (const file of aiActionFiles) {
            const source = readFileSync(file, "utf8");
            expect(source).toMatch(/runAiAction(FromPrompt)?\(/);
            // An AI action that reached for the writer directly would bypass the verdict entirely.
            expect(source).not.toMatch(/writeKnowledgeResult\(/);
        }
    });

    it("the interpretive set is exactly the six known actions, so a seventh cannot slip in", () => {
        const ids = aiActionFiles.map((file) => file.split(/[\\/]/).pop()).sort();

        expect(ids).toEqual([
            "ChallengeIdeaAction.tsx",
            "ClassifyAction.tsx",
            "GenerateQuestionsAction.tsx",
            "SuggestConnectionsAction.tsx",
            "SummarizeAction.tsx",
            "SynthesizeAction.tsx",
        ]);
    });
});

describe("the verdict path is the only door to the AI write (#337)", () => {
    const core = readFileSync(join(ROOT, "src", "actions", "ai", "aiActionCore.ts"), "utf8");

    it("writes only after a verdict, and never on a rejection", () => {
        expect(core).toMatch(/if \(!outcome\) return;/);
        expect(core).toMatch(/if \(outcome\.verdict === "rejected"\) return;/);
        expect(core.indexOf("deps.review(")).toBeLessThan(core.indexOf("writeKnowledgeResult("));
    });

    it("never runs during an automation, with no setting able to re-enable it", () => {
        expect(core).toMatch(/if \(info\.silent\)/);
        expect(core).not.toContain("allowInAutomations");
    });
});

describe("the retired automations setting is gone everywhere (#337, T3)", () => {
    it("leaves no reference in src/", () => {
        const offenders: string[] = [];
        for (const file of actionFiles(join(ROOT, "src"))) {
            if (/allowInAutomations|settings_ai_automations/.test(readFileSync(file, "utf8"))) offenders.push(file);
        }
        expect(offenders).toEqual([]);
    });
});

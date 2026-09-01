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

    /**
     * `proposeCompletion` was factored out in #350 so `zf.ai.propose` shares this exact path rather than
     * getting a second, quieter one. The invariant is unchanged and now spans two functions: the
     * proposal step returns `null` unless a verdict was given, and the write step refuses both that
     * `null` and a rejection before it reaches the writer.
     */
    const proposalStart = core.indexOf("export async function proposeCompletion");
    /** The function that writes, isolated from the one that proposes. */
    const writePath = core.slice(core.indexOf("export async function runAiActionFromPrompt"), proposalStart);
    /** The shared proposal path. */
    const proposalPath = core.slice(proposalStart);

    it("writes only after a verdict, and never on a rejection", () => {
        expect(writePath).toMatch(/if \(!outcome \|\| outcome\.verdict === "rejected"\) return;/);
        expect(writePath.indexOf("proposeCompletion(")).toBeLessThan(writePath.indexOf("writeKnowledgeResult("));
    });

    it("puts every completion to the user before it becomes an outcome", () => {
        // A dismissal is not a verdict, so it yields nothing to write and records nothing.
        expect(proposalPath).toMatch(/if \(!outcome\) return null;/);
        expect(proposalPath.indexOf("getProvider().complete(")).toBeLessThan(proposalPath.indexOf("deps.review("));
        expect(proposalPath.indexOf("deps.review(")).toBeLessThan(proposalPath.indexOf("deps.record("));
    });

    it("keeps one shared proposal path, so zf.ai.propose cannot get a quieter one (#350)", () => {
        expect(core).toMatch(/export async function proposeCompletion\(/);
        expect(writePath).not.toMatch(/getProvider\(\)\.complete\(/);
    });

    it("never runs during an automation, with no setting able to re-enable it", () => {
        expect(core).toMatch(/if \(info\.silent\)/);
        expect(core).not.toContain("allowInAutomations");
    });
});

describe("the retired automations setting is gone everywhere (#337, T3)", () => {
    /**
     * One site is allowed and required: `loadSettings` deletes the key so it does not sit in a user's
     * `data.json` forever, implying a switch that no longer exists (#320). Everywhere else, a mention
     * would mean something still reads, writes or offers it.
     */
    const MIGRATION = join("src", "main.ts");

    it("is referenced nowhere but the migration that deletes it", () => {
        const offenders: string[] = [];
        for (const file of actionFiles(join(ROOT, "src"))) {
            if (file.endsWith(MIGRATION)) continue;
            if (/allowInAutomations|settings_ai_automations/.test(readFileSync(file, "utf8"))) offenders.push(file);
        }
        expect(offenders).toEqual([]);
    });

    it("only ever deletes it there — never reads or writes it", () => {
        const main = readFileSync(join(ROOT, MIGRATION), "utf8");
        const mentions = main
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.includes("allowInAutomations") && !line.startsWith("//"));

        expect(mentions).toHaveLength(1);
        expect(mentions[0].startsWith("delete ")).toBe(true);
    });

    it("keeps its locale keys retired", () => {
        for (const file of actionFiles(join(ROOT, "src"))) {
            expect(readFileSync(file, "utf8")).not.toContain("settings_ai_automations");
        }
    });
});

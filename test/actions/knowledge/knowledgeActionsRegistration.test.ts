import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/actions/knowledge → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ACTION_FILES = [
    "src/actions/detectOrphan/DetectOrphanAction.tsx",
    "src/actions/calculateMaturity/CalculateMaturityAction.tsx",
    "src/actions/findContradiction/FindContradictionAction.tsx",
    "src/actions/findUnansweredQuestion/FindUnansweredQuestionAction.tsx",
    "src/actions/suggestNextMove/SuggestNextMoveAction.tsx",
    "src/actions/thinkingSimulator/ThinkingSimulatorAction.tsx",
];

const LOGIC_FILES = [
    "src/actions/detectOrphan/detectOrphanLogic.ts",
    "src/architecture/knowledge/derive/maturityLogic.ts",
    "src/actions/findContradiction/findContradictionLogic.ts",
    "src/actions/findUnansweredQuestion/findUnansweredQuestionLogic.ts",
    "src/actions/suggestNextMove/nextMoveLogic.ts",
    "src/actions/thinkingSimulator/thinkingSimulatorLogic.ts",
];

const ALL_KNOWLEDGE_SOURCES = [
    ...ACTION_FILES,
    ...LOGIC_FILES,
    "src/actions/knowledge/knowledgeActionShared.ts",
];

const REGISTERED_CLASSES = [
    "DetectOrphanAction",
    "CalculateMaturityAction",
    "FindContradictionAction",
    "FindUnansweredQuestionAction",
    "SuggestNextMoveAction",
    "ThinkingSimulatorAction",
];

describe("knowledge action guardrails (#153, AC-2/AC-3/AC-4)", () => {
    it("each action declares the knowledge category (AC-2)", () => {
        for (const file of ACTION_FILES) {
            expect(read(file)).toMatch(/category\s*=\s*"knowledge"\s+as const/);
        }
    });

    it("main.ts registers all four knowledge actions (AC-2)", () => {
        const main = read("src/main.ts");
        for (const cls of REGISTERED_CLASSES) {
            expect(main).toContain(`registerAction(new ${cls}())`);
        }
    });

    it("no knowledge source makes a network call or imports an AI provider (AC-3, AC-4)", () => {
        for (const file of ALL_KNOWLEDGE_SOURCES) {
            const source = read(file);
            expect(source).not.toMatch(/\brequestUrl\b/);
            expect(source).not.toMatch(/\bfetch\s*\(/);
            expect(source).not.toMatch(/openai|anthropic|@google|langchain/i);
        }
    });

    it("each pure logic module is Obsidian-free and avoids the knowledge barrel", () => {
        for (const file of LOGIC_FILES) {
            const source = read(file);
            expect(source).not.toMatch(/from\s+["']obsidian["']/);
            expect(source).not.toMatch(/from\s+["']architecture\/knowledge["']/);
        }
    });
});

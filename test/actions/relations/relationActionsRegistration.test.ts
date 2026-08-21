import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/actions/relations → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// Grows as the three relation actions land: T4 find-related, T5 suggest-link, T6 create.
const ACTION_FILES = [
    "src/actions/findRelated/FindRelatedAction.tsx",
    "src/actions/suggestLink/SuggestLinkAction.tsx",
    "src/actions/createSemanticRelation/CreateSemanticRelationAction.tsx",
];

const LOGIC_FILES = [
    "src/architecture/knowledge/relations/relationRankingLogic.ts",
    "src/actions/createSemanticRelation/createSemanticRelationLogic.ts",
];

const ALL_RELATION_SOURCES = [
    ...ACTION_FILES,
    ...LOGIC_FILES,
    "src/actions/relations/relationActionShared.ts",
];

const REGISTERED_CLASSES = [
    "FindRelatedAction",
    "SuggestLinkAction",
    "CreateSemanticRelationAction",
];

describe("relation action guardrails (#154, AC-4/AC-5)", () => {
    it("each action declares the relations category (AC-4)", () => {
        for (const file of ACTION_FILES) {
            expect(read(file)).toMatch(/category\s*=\s*"relations"\s+as const/);
        }
    });

    it("main.ts registers every relation action (AC-4)", () => {
        const main = read("src/main.ts");
        for (const cls of REGISTERED_CLASSES) {
            expect(main).toContain(`registerAction(new ${cls}())`);
        }
    });

    it("no relation source makes a network call or imports an AI provider (AC-5)", () => {
        for (const file of ALL_RELATION_SOURCES) {
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

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/actions/research → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// Grows across T6–T9 as each research action lands.
const ACTION_FILES = [
    "src/actions/extractClaims/ExtractClaimsAction.tsx",
];

const LOGIC_FILES = [
    "src/actions/extractClaims/extractClaimsLogic.ts",
];

const ALL_RESEARCH_SOURCES = [
    ...ACTION_FILES,
    ...LOGIC_FILES,
    "src/actions/research/researchActionShared.ts",
];

const REGISTERED_CLASSES = [
    "ExtractClaimsAction",
];

describe("research action guardrails (#155, AC-4/AC-5/FR-6)", () => {
    it("each action declares the research category (AC-4)", () => {
        for (const file of ACTION_FILES) {
            expect(read(file)).toMatch(/category\s*=\s*"research"\s+as const/);
        }
    });

    it("main.ts registers every research action (AC-4)", () => {
        const main = read("src/main.ts");
        for (const cls of REGISTERED_CLASSES) {
            expect(main).toContain(`registerAction(new ${cls}())`);
        }
    });

    it("no research source makes a network call or imports an AI provider (FR-6)", () => {
        for (const file of ALL_RESEARCH_SOURCES) {
            const source = read(file);
            expect(source).not.toMatch(/\brequestUrl\b/);
            expect(source).not.toMatch(/\bfetch\s*\(/);
            expect(source).not.toMatch(/openai|anthropic|@google|langchain/i);
        }
    });

    it("no research source mutates a foreign note (AC-5) — writes go through the DTO", () => {
        for (const file of ALL_RESEARCH_SOURCES) {
            const source = read(file);
            expect(source).not.toMatch(/processFrontMatter/);
            expect(source).not.toMatch(/\.modify\s*\(/);
            expect(source).not.toMatch(/\.create\s*\(/);
            expect(source).not.toMatch(/\.rename\s*\(/);
            expect(source).not.toMatch(/\.trash\s*\(/);
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

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/actions/ai → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PROVIDER = "src/architecture/ai/OpenAiCompatibleProvider.ts";

const PURE_LOGIC = [
    "src/architecture/ai/aiGate.ts",
    "src/architecture/ai/openaiCompatibleLogic.ts",
];

// Grows across T9–T11 as each AI action lands.
const ACTION_FILES = [
    "src/actions/ai/SummarizeAction.tsx",
    "src/actions/ai/ClassifyAction.tsx",
    "src/actions/ai/GenerateQuestionsAction.tsx",
    "src/actions/ai/ChallengeIdeaAction.tsx",
    "src/actions/ai/SynthesizeAction.tsx",
    "src/actions/ai/SuggestConnectionsAction.tsx",
];

const REGISTERED_CLASSES = [
    "SummarizeAction",
    "ClassifyAction",
    "GenerateQuestionsAction",
    "ChallengeIdeaAction",
    "SynthesizeAction",
    "SuggestConnectionsAction",
];

const ALL_AI_SOURCES = [
    "src/architecture/ai/aiGate.ts",
    "src/architecture/ai/openaiCompatibleLogic.ts",
    "src/architecture/ai/AiProvider.ts",
    "src/architecture/ai/OpenAiCompatibleProvider.ts",
    "src/architecture/ai/AiService.ts",
    "src/actions/ai/aiActionShared.ts",
    ...ACTION_FILES,
];

describe("ai infrastructure guardrails (#156, AC-4/FR-3/FR-5)", () => {
    it("each action declares the ai category (AC-4)", () => {
        for (const file of ACTION_FILES) {
            expect(read(file)).toMatch(/category\s*=\s*"ai"\s+as const/);
        }
    });

    it("main.ts registers every AI action (AC-4)", () => {
        const main = read("src/main.ts");
        for (const cls of REGISTERED_CLASSES) {
            expect(main).toContain(`registerAction(new ${cls}())`);
        }
    });

    it("only the provider module reaches the network via requestUrl, and never fetch", () => {
        for (const file of ALL_AI_SOURCES) {
            const source = read(file);
            if (file === PROVIDER) expect(source).toMatch(/\brequestUrl\b/);
            else expect(source).not.toMatch(/\brequestUrl\b/);
            expect(source).not.toMatch(/\bfetch\s*\(/);
        }
    });

    it("no AI source logs the API key", () => {
        for (const file of ALL_AI_SOURCES) {
            expect(read(file)).not.toMatch(/log\.\w+\([^)]*apiKey/);
        }
    });

    it("pure logic modules are Obsidian-free", () => {
        for (const file of PURE_LOGIC) {
            expect(read(file)).not.toMatch(/from\s+["']obsidian["']/);
        }
    });

    it("the settings group surfaces the data-disclosure text (AC-3)", () => {
        expect(read("src/config/modals/handlers/aiSettingsGroup.ts")).toMatch(/settings_ai_disclosure/);
    });

    it("no AI source mutates a foreign note — writes go through the DTO", () => {
        for (const file of ALL_AI_SOURCES) {
            const source = read(file);
            expect(source).not.toMatch(/processFrontMatter/);
            expect(source).not.toMatch(/\.modify\s*\(/);
            expect(source).not.toMatch(/\.create\s*\(/);
            expect(source).not.toMatch(/\.rename\s*\(/);
            expect(source).not.toMatch(/\.trash\s*\(/);
        }
    });
});

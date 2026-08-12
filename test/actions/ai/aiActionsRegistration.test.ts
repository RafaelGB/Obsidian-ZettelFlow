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

// Grows in T9+ with the three action files.
const ALL_AI_SOURCES = [
    "src/architecture/ai/aiGate.ts",
    "src/architecture/ai/openaiCompatibleLogic.ts",
    "src/architecture/ai/AiProvider.ts",
    "src/architecture/ai/OpenAiCompatibleProvider.ts",
    "src/architecture/ai/AiService.ts",
    "src/actions/ai/aiActionShared.ts",
];

describe("ai infrastructure guardrails (#156, AC-4/FR-3/FR-5)", () => {
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

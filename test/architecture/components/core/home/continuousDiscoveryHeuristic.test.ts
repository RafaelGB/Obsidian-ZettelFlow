import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/components/core/home → 5 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * The whole continuous-discovery path: the Home renderer's vault listeners, and every projection they
 * run on a vault change. If any of these ever reached an AI provider, discovery would be firing the model
 * in the background — exactly what #337 / constitution §XII forbid.
 */
const CONTINUOUS_PATH = [
    "src/architecture/components/core/home/HomeModeRenderer.ts",
    "src/architecture/components/core/home/homeRecommendations.ts",
    "src/architecture/knowledge/state/recommendation.ts",
    "src/architecture/knowledge/discovery/discoveries.ts",
    "src/architecture/knowledge/home/home.ts",
    "src/architecture/knowledge/questions/openQuestions.ts",
];

describe("continuous discovery is heuristic-only — AI never auto-fires (#365, D5, §XII/#337)", () => {
    it("re-runs on every vault change: create, modify (resolved), rename and delete", () => {
        const renderer = read("src/architecture/components/core/home/HomeModeRenderer.ts");
        for (const event of ['vault.on("create"', 'metadataCache.on("resolved"', 'vault.on("rename"', 'vault.on("delete"']) {
            expect(`${event} → ${renderer.includes(event)}`).toBe(`${event} → true`);
        }
    });

    it("reaches no AI provider anywhere on the continuous path", () => {
        for (const file of CONTINUOUS_PATH) {
            const source = read(file);
            expect(source).not.toMatch(/from\s+["']architecture\/ai/);
            expect(source).not.toMatch(/from\s+["']actions\/ai/);
            expect(source).not.toMatch(/\bAiService\b/);
            expect(source).not.toMatch(/\.complete\s*\(/);
            expect(source).not.toMatch(/\brequestUrl\b/);
            expect(source).not.toMatch(/openai|anthropic|@google|langchain/i);
        }
    });
});

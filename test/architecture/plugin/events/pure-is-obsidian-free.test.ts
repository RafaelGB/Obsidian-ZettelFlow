import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// src/architecture/plugin/events, reached from test/architecture/plugin/events/
const EVENTS_ROOT = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "src",
    "architecture",
    "plugin",
    "events"
);

// The runtime orchestrator legitimately imports from "obsidian"; every other module in the folder
// is the pure, Obsidian-free core (the #146/#147/#149 split).
const RUNTIME_ONLY = new Set(["WorkflowEventEngine.ts"]);

function pureEventFiles(): string[] {
    return readdirSync(EVENTS_ROOT)
        .filter((entry) => entry.endsWith(".ts") && !RUNTIME_ONLY.has(entry))
        .map((entry) => join(EVENTS_ROOT, entry));
}

describe("event core stays Obsidian-free (purity guard)", () => {
    it("no pure event module imports from 'obsidian'", () => {
        const files = pureEventFiles();
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect(source).not.toMatch(/from\s+["']obsidian["']/);
        }
    });
});

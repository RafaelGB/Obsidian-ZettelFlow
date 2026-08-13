import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// src/architecture/plugin/workflow, reached from test/architecture/plugin/workflow/
const WORKFLOW_ROOT = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "src",
    "architecture",
    "plugin",
    "workflow"
);

describe("workflow language core stays Obsidian-free (purity guard)", () => {
    it("no workflow core module imports from 'obsidian'", () => {
        const files = readdirSync(WORKFLOW_ROOT)
            .filter((entry) => entry.endsWith(".ts"))
            .map((entry) => join(WORKFLOW_ROOT, entry));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect(source).not.toMatch(/from\s+["']obsidian["']/);
        }
    });
});

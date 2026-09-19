import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// src/architecture/knowledge, reached from test/architecture/knowledge/
const KNOWLEDGE_ROOT = join(__dirname, "..", "..", "..", "src", "architecture", "knowledge");
const PURE_DIRS = ["model", "parse", "derive", "query", "lifecycle", "relations", "claims", "debt", "review", "balance", "journal", "judgement", "discovery", "map", "traverse", "questions", "timeline", "synthesis", "dashboard", "home", "projects", "context", "taxonomy", "state"];

function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
        else if (entry.endsWith(".ts")) out.push(full);
    }
    return out;
}

describe("pure core stays Obsidian-free (AC-4)", () => {
    it("no file under model/parse/derive/query imports from 'obsidian'", () => {
        const files = PURE_DIRS.flatMap((dir) => collectTsFiles(join(KNOWLEDGE_ROOT, dir)));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect(source).not.toMatch(/from\s+["']obsidian["']/);
        }
    });

    it("and none of them reaches into the plugin layer for anything that survives compilation (#482)", () => {
        // `obsidian` is the obvious door out of purity; `architecture/plugin` is the quiet one —
        // it is Obsidian-free by name only, and a *value* import drags a live vault behind it.
        // `import type` is allowed: it is erased, so it borrows a shape without borrowing a world.
        const value = /^import\s+(?!type\b)[^;]*?from\s+["']architecture\/plugin/m;
        const files = PURE_DIRS.flatMap((dir) => collectTsFiles(join(KNOWLEDGE_ROOT, dir)));
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect({ file, plugin: value.test(source) }).toEqual({ file, plugin: false });
        }
    });
});

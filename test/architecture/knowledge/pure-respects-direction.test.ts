import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname, resolve } from "path";

// src/architecture/knowledge, reached from test/architecture/knowledge/
const KNOWLEDGE_ROOT = join(__dirname, "..", "..", "..", "src", "architecture", "knowledge");

// The pure Knowledge layer (same set as pure-is-obsidian-free) — the model + its analyses. The root
// adapters KnowledgeIndex.ts / snapshot.ts legitimately touch Obsidian and stay OUT of this set.
const PURE_DIRS = ["model", "parse", "derive", "query", "lifecycle", "relations", "claims", "debt", "review", "balance", "journal", "discovery", "map", "traverse", "questions", "timeline", "synthesis", "dashboard", "home", "projects", "context", "taxonomy", "state"];

// Outer/sibling layers the pure Knowledge layer must never import (§XI: knowledge imports only inward).
const FORBIDDEN_PREFIXES = [
    "application",
    "zettelkasten",
    "hooks",
    "config",
    "starters",
    "actions",
    "architecture/components",
    "architecture/plugin",
    "architecture/api",
];

// The single documented exception: a zero-import pure type file under architecture/plugin/model.
const ALLOWED_EXCEPTIONS = new Set(["architecture/plugin/model/FrontmatterModel"]);

function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

function importsOf(source: string): string[] {
    return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function isForbidden(spec: string, file: string): boolean {
    if (ALLOWED_EXCEPTIONS.has(spec)) return false;
    if (spec === "obsidian" || spec.startsWith("obsidian/")) return true;
    if (FORBIDDEN_PREFIXES.some((p) => spec === p || spec.startsWith(p + "/"))) return true;
    if (spec.startsWith(".")) {
        // A relative import that escapes the knowledge root is an outward import.
        const resolved = resolve(dirname(file), spec);
        return !resolved.startsWith(KNOWLEDGE_ROOT);
    }
    return false; // intra-knowledge (architecture/knowledge/…) or Foundation (lang/monitoring) — allowed inward.
}

describe("pure Knowledge layer imports only inward (#209, epic #262 Phase 6, §XI)", () => {
    const files = PURE_DIRS.flatMap((dir) => collectTsFiles(join(KNOWLEDGE_ROOT, dir)));

    it("scans a non-empty set of pure knowledge files", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it("never imports an outer layer (application/zettelkasten/hooks/config/starters/actions/components/plugin/api/obsidian)", () => {
        const offenders: string[] = [];
        for (const file of files) {
            for (const spec of importsOf(readFileSync(file, "utf8"))) {
                if (isForbidden(spec, file)) {
                    offenders.push(`${file.replace(KNOWLEDGE_ROOT, "knowledge")} → ${spec}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

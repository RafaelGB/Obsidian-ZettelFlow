import { describe, it, expect } from "@jest/globals";
import { excludedPrefixOf, normalizeExcludedPaths, systemExcludedPaths, type ScopeSettings } from "architecture/knowledge/scope/knowledgeScope";
import { compileScope, scopeVerdict } from "architecture/knowledge/scope/scopeEvaluate";
import { scopeRulesOf } from "architecture/knowledge/scope/scopeRules";
import { migrateSettings, type MigratableSettings } from "config/settingsMigration";

/**
 * The previous version's predicate, kept here as the oracle (#713, AC-6): the user's excluded
 * folders plus ZettelFlow's own, one folder-boundary prefix match. The migration must leave out
 * exactly the notes this left out — not roughly, not on a fixture, but for any path.
 */
function oldLeftOut(settings: ScopeSettings, path: string): boolean {
    const system = [settings.foldersFlowsPath, settings.jsLibraryFolderPath, settings.hooks?.folderFlowPath, settings.thoughtLabPath];
    const prefixes = normalizeExcludedPaths([...(settings.excludedPaths ?? []), ...system.filter((p): p is string => typeof p === "string")]);
    return excludedPrefixOf(path, prefixes) !== null;
}

function newLeftOut(settings: ScopeSettings, path: string): boolean {
    const migrated = migrateSettings({ ...(settings as MigratableSettings) }).settings as ScopeSettings;
    const compiled = compileScope(scopeRulesOf(migrated), systemExcludedPaths(migrated));
    return !scopeVerdict(compiled, { path, tags: [], frontmatter: null }).in;
}

/** A small deterministic generator, so a failure reproduces. */
function rng(seed: number): () => number {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const NAMES = ["Templates", "Templates-old", "Archive", "Old", "Résumés", "Résumés", "Notes", "a", "a b", "📚 Books"];

describe("the migration leaves out exactly what the previous version did (#713, AC-6)", () => {
    it("agrees with the old predicate on every one of thousands of generated paths", () => {
        const next = rng(713);
        const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
        let checked = 0;
        for (let round = 0; round < 40; round++) {
            const excluded = Array.from({ length: 1 + Math.floor(next() * 4) }, () => {
                const depth = 1 + Math.floor(next() * 2);
                return Array.from({ length: depth }, () => pick(NAMES)).join("/");
            });
            const settings: ScopeSettings = {
                excludedPaths: next() < 0.2 ? excluded.map((p) => `/${p}/`) : excluded,
                foldersFlowsPath: "_ZettelFlow/folders",
                jsLibraryFolderPath: next() < 0.5 ? "_ZettelFlow/scripts" : "",
                hooks: { folderFlowPath: "_ZettelFlow/hooks" },
                thoughtLabPath: "_ZettelFlow/lab",
            };
            for (let i = 0; i < 60; i++) {
                const depth = 1 + Math.floor(next() * 3);
                const parts = Array.from({ length: depth }, () => pick([...NAMES, "_ZettelFlow", "lab", "folders"]));
                const leaf = pick(["note.md", "x.md", ""]);
                const path = leaf ? [...parts, leaf].join("/") : `${parts.join("/")}.md`;
                expect([path, newLeftOut(settings, path)]).toEqual([path, oldLeftOut(settings, path)]);
                checked++;
            }
        }
        expect(checked).toBeGreaterThanOrEqual(2000);
    });

    it("leaves out the same notes of a fixture vault, byte for byte", () => {
        const settings: ScopeSettings = {
            excludedPaths: ["Templates", "Archive/Old", "Résumés"],
            foldersFlowsPath: "_ZettelFlow/folders",
            hooks: { folderFlowPath: "_ZettelFlow/hooks" },
            thoughtLabPath: "_ZettelFlow/lab",
        };
        const vault = [
            "Templates.md",
            "Templates/Book.md",
            "Templates/sub/Weekly.md",
            "Templates-old/keep.md",
            "Archive/Old/2019.md",
            "Archive/Older/2018.md",
            "Archive/Old.md",
            "Résumés/cv.md",
            "_ZettelFlow/lab/thought.md",
            "_ZettelFlow/folders/step.md",
            "Ideas/Event sourcing.md",
        ];
        const before = vault.filter((path) => oldLeftOut(settings, path)).sort();
        const after = vault.filter((path) => newLeftOut(settings, path)).sort();
        expect(after).toEqual(before);
        expect(before.length).toBe(8);
    });
});

import { describe, it, expect } from "@jest/globals";
import { generateVault } from "./generateVault";

/**
 * The vault the budgets measure against (#457).
 *
 * This is the only part of the harness that runs in the normal suite: a generator that is not
 * deterministic, or not vault-shaped, would make every budget below it meaningless — so it is
 * checked on every push, while the budgets themselves run in their own job.
 */
describe("a vault we can measure (#457)", () => {
    it("is deterministic: the same seed gives the same vault, twice", () => {
        expect(generateVault(200, 7)).toEqual(generateVault(200, 7));
    });

    it("is not one vault repeated: a different seed gives a different one", () => {
        expect(generateVault(200, 7)).not.toEqual(generateVault(200, 8));
    });

    it("makes exactly as many notes as it was asked for, each with its own path", () => {
        const vault = generateVault(500);
        expect(vault).toHaveLength(500);
        expect(new Set(vault.map((note) => note.path)).size).toBe(500);
    });

    it("puts notes in folders, rather than all in the root", () => {
        const folders = new Set(generateVault(500).map((note) => note.path.split("/")[0]));
        expect(folders.size).toBeGreaterThan(1);
    });

    it("links to notes that exist, so the graph resolves", () => {
        const vault = generateVault(500);
        const paths = new Set(vault.map((note) => note.path));
        for (const note of vault) {
            for (const link of note.outgoingLinks) expect(paths.has(link)).toBe(true);
            for (const target of Object.values(note.resolvedTargets ?? {})) {
                expect(paths.has(target)).toBe(true);
            }
        }
    });

    it("has a realistic share of orphans — a real vault is not evenly connected", () => {
        const vault = generateVault(1000);
        const orphans = vault.filter((note) => note.outgoingLinks.length === 0).length;
        expect(orphans).toBeGreaterThan(50);
        expect(orphans).toBeLessThan(500);
    });

    it("skews its tags, because real tags are not uniform", () => {
        const counts = new Map<string, number>();
        for (const note of generateVault(1000)) {
            for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        const ordered = [...counts.values()].sort((left, right) => right - left);
        expect(ordered.length).toBeGreaterThan(5);
        // The commonest tag is worth several of the rarest — a flat distribution would make every
        // tag query cost the same, which is not the shape being measured.
        expect(ordered[0]).toBeGreaterThan(ordered[ordered.length - 1] * 3);
    });

    it("gives most notes frontmatter a schema can classify", () => {
        const vault = generateVault(500);
        const classified = vault.filter((note) => typeof note.frontmatter.state === "string").length;
        expect(classified).toBeGreaterThan(vault.length / 2);
    });

    it("carries inline fields, which is what the enrichment pass exists for", () => {
        const withInline = generateVault(500).filter((note) => note.inlineFields.length > 0);
        expect(withInline.length).toBeGreaterThan(20);
    });

    it("spreads created and modified times across a plausible history", () => {
        const vault = generateVault(500);
        const created = vault.map((note) => note.created);
        expect(Math.max(...created) - Math.min(...created)).toBeGreaterThan(30 * 24 * 60 * 60 * 1000);
        for (const note of vault) expect(note.modified).toBeGreaterThanOrEqual(note.created);
    });

    it("builds fifty thousand notes in seconds, not minutes", () => {
        const started = Date.now();
        expect(generateVault(50_000)).toHaveLength(50_000);
        expect(Date.now() - started).toBeLessThan(20_000);
    }, 30_000);
});

import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const SERVICES = join("architecture", "plugin", "services");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * Writing to the vault, spelled every way it can be spelled. `createFolder` is not here: a folder
 * is structure, not content, and there is nothing to record or take back about one.
 */
const DIRECT_WRITE =
    /\bvault(?:\(\))?\s*\.\s*(?:createBinary|create|modifyBinary|modify|delete|trash)\(|\bfileManager(?:\(\))?\s*\.\s*(?:renameFile|trashFile|processFrontMatter)\(/;

/**
 * One door, and the test that keeps it shut (#456, epic #451).
 *
 * `FnConstructor` did this for running code: one home, and a guardrail that derives its list of
 * callers from the source rather than from a list in the test. Writes get the same treatment,
 * because the reason a record like #453's rots is the writer that arrives later and does not join
 * it — and `vault.modify` is one import away from anywhere.
 *
 * The rule: everything that changes a file goes through `FileService` or `FrontmatterService`,
 * which is where the write is recorded. Nothing else reaches the vault's mutating API.
 */
describe("every vault write goes through one seam (#456)", () => {
    const files = sources(SRC).map((path) => ({
        path: relative(SRC, path),
        text: readFileSync(path, "utf8"),
    }));

    it("reads the whole of src, not a corner of it", () => {
        expect(files.length).toBeGreaterThan(400);
    });

    it("has no direct vault write outside the services", () => {
        const offenders = files
            .filter(({ path }) => !path.startsWith(SERVICES + sep) && path !== SERVICES + ".ts")
            .filter(({ text }) => DIRECT_WRITE.test(text))
            .map(({ path }) => path);
        expect(offenders).toEqual([]);
    });

    it("still has the services writing, or the rule would be vacuous", () => {
        const writing = files
            .filter(({ path }) => path.startsWith(SERVICES + sep))
            .filter(({ text }) => DIRECT_WRITE.test(text))
            .map(({ path }) => path);
        expect(writing.length).toBeGreaterThanOrEqual(2);
    });

    it("has the frontmatter service offer the one update everyone else uses", () => {
        const frontmatter = readFileSync(join(SRC, SERVICES, "FrontmatterService.ts"), "utf8");
        // The public door onto the private, recorded `processFrontMatter`.
        expect(frontmatter).toContain("public async update(");
    });
});

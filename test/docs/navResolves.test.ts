import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// test/docs → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const MKDOCS = readFileSync(join(ROOT, "mkdocs.yml"), "utf8");

/**
 * The nav resolves (#565, epic #558).
 *
 * `mkdocs build --strict` is the real check and it cannot run here: mkdocs is not a repo dependency
 * and is not installed, so the docs build lives in its own workflow. What *is* automatable is the
 * failure that actually happens — a nav entry pointing at a page nobody created, or a page renamed
 * without the nav being told — and it costs nothing to assert on every push.
 */
describe("every page the nav offers exists (#565)", () => {
    const referenced = [...MKDOCS.matchAll(/:\s*([A-Za-z0-9_\-/.]+\.md)\s*$/gm)].map((match) => match[1]);

    it("reads a nav worth checking", () => {
        // A vacuous pass is the only way this test can lie.
        expect(referenced.length).toBeGreaterThan(50);
    });

    it("points at nothing that is missing", () => {
        const missing = referenced.filter((path) => !existsSync(join(ROOT, "docs", path)));
        expect(missing).toEqual([]);
    });

    it("offers the page this epic added", () => {
        expect(referenced).toContain("development/claim-returns.md");
    });
});

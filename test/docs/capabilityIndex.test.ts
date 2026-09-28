import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { capabilityIndex, CAPABILITY_INDEX_MARK, readerName } from "./capabilityIndex";
import { CAPABILITIES } from "architecture/components/core/surface/capabilities";

/**
 * The reader-facing capability page is generated, not written (#588, FR-2 / decision 2).
 *
 * Modelled on `generatedContract.test.ts`: the committed page must equal the generator, CRLF-normalised
 * (a raw comparison passes on CI and fails on half the machines that check it out). Regenerate with
 * `UPDATE_DOCS=1 npx jest capabilityIndex`.
 */
const ROOT = join(__dirname, "..", "..");
const PAGE_PATH = join(ROOT, "docs", "reference", "capabilities.md");
const CRLF = /\r\n/g;

describe("docs/reference/capabilities.md is generated, not written (#588, FR-2)", () => {
    it("matches the generator exactly", () => {
        const expected = capabilityIndex();
        if (process.env.UPDATE_DOCS) writeFileSync(PAGE_PATH, expected, "utf8");
        expect(existsSync(PAGE_PATH)).toBe(true);
        expect(readFileSync(PAGE_PATH, "utf8").replace(CRLF, "\n")).toBe(expected);
    });

    it("marks the page as generated, so nobody edits it by hand", () => {
        expect(readFileSync(PAGE_PATH, "utf8")).toContain(CAPABILITY_INDEX_MARK);
    });

    it("names every capability, so none is quietly dropped from the reader's view", () => {
        const page = readFileSync(PAGE_PATH, "utf8").replace(CRLF, "\n");
        const missing = CAPABILITIES.filter((id) => !page.includes(readerName(id)));
        expect(missing).toEqual([]);
    });

    it("is listed in the docs navigation", () => {
        expect(readFileSync(join(ROOT, "mkdocs.yml"), "utf8")).toContain("reference/capabilities.md");
    });
});

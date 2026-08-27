import { describe, it, expect } from "@jest/globals";
import {
    normalizeExcludedPaths,
    isPathExcluded,
    parseExcludedPathsInput,
    excludedPathsToText,
} from "architecture/knowledge/scope/knowledgeScope";

describe("knowledgeScope (#311)", () => {
    it("normalises prefixes (slashes, trim, dedupe, drop empty)", () => {
        expect(normalizeExcludedPaths(["  templates/ ", "\\config\\", "templates", "", "  "])).toEqual([
            "templates",
            "config",
        ]);
    });

    it("excludes notes under a folder prefix, at the boundary only", () => {
        const prefixes = ["templates", "_ZettelFlow"];
        expect(isPathExcluded("templates/note.md", prefixes)).toBe(true);
        expect(isPathExcluded("templates/sub/deep.md", prefixes)).toBe(true);
        expect(isPathExcluded("templates.md", prefixes)).toBe(true); // the note named templates
        expect(isPathExcluded("_ZettelFlow/hooks/x.md", prefixes)).toBe(true);
        // boundary-safe: a sibling folder that merely shares the prefix is NOT excluded
        expect(isPathExcluded("templates-other/note.md", prefixes)).toBe(false);
        expect(isPathExcluded("ideas/note.md", prefixes)).toBe(false);
    });

    it("handles an empty prefix list (nothing excluded) and raw settings values", () => {
        expect(isPathExcluded("anything.md", [])).toBe(false);
        expect(isPathExcluded("config/a.md", [" config/ "])).toBe(true);
    });

    it("round-trips the textarea representation", () => {
        const parsed = parseExcludedPathsInput("templates\n config/ \n\ntemplates\n");
        expect(parsed).toEqual(["templates", "config"]);
        expect(excludedPathsToText(parsed)).toBe("templates\nconfig");
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    normalizeExcludedPaths,
    isPathExcluded,
    parseExcludedPathsInput,
    excludedPathsToText,
    scopeExcludedPaths,
} from "architecture/knowledge/scope/knowledgeScope";

describe("knowledgeScope (#311)", () => {
    it("scopeExcludedPaths auto-excludes ZettelFlow's system folders alongside the user list", () => {
        const paths = scopeExcludedPaths({
            excludedPaths: ["templates"],
            foldersFlowsPath: "_ZettelFlow/folders",
            jsLibraryFolderPath: "_ZettelFlow/scripts",
            hooks: { folderFlowPath: "_ZettelFlow/hooks" },
        });
        expect(paths).toEqual(["templates", "_ZettelFlow/folders", "_ZettelFlow/scripts", "_ZettelFlow/hooks"]);
        // A flow step note and a hook script are out of scope even though the user never listed them.
        expect(isPathExcluded("_ZettelFlow/folders/step.md", paths)).toBe(true);
        expect(isPathExcluded("_ZettelFlow/hooks/on-create.canvas", paths)).toBe(true);
        expect(isPathExcluded("ideas/real-note.md", paths)).toBe(false);
    });

    it("scopeExcludedPaths tolerates missing/blank system settings", () => {
        expect(scopeExcludedPaths({})).toEqual([]);
        expect(scopeExcludedPaths({ excludedPaths: ["a"], foldersFlowsPath: "", jsLibraryFolderPath: undefined })).toEqual(["a"]);
    });

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

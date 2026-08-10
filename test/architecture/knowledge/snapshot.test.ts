import { describe, it, expect } from "@jest/globals";
import { __setMockObsidianApi } from "architecture";
import { gatherSnapshot } from "architecture/knowledge/snapshot";
import { TFile } from "obsidian";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.basename = path.replace(/\.md$/, "");
    f.extension = "md";
    (f as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = {
        ctime: 1,
        mtime: 2,
        size: 0,
    };
    return f;
}

describe("gatherSnapshot — frontmatter relation resolution (#147)", () => {
    it("resolves wikilink names under semantic keys to vault paths (AC-1 / FR-5)", () => {
        __setMockObsidianApi({
            metadataCache: {
                getFileCache: () => ({ frontmatter: { contradicts: ["[[B]]"] }, tags: [] }),
                resolvedLinks: {},
                getFirstLinkpathDest: (name: string) =>
                    name === "B" ? { path: "b.md" } : null,
            } as never,
        });

        const snapshot = gatherSnapshot(file("a.md"));
        expect(snapshot.resolvedTargets).toEqual({ B: "b.md" });
    });

    it("does not resolve non-relation frontmatter keys", () => {
        __setMockObsidianApi({
            metadataCache: {
                getFileCache: () => ({ frontmatter: { author: "[[Someone]]" }, tags: [] }),
                resolvedLinks: {},
                getFirstLinkpathDest: () => ({ path: "someone.md" }),
            } as never,
        });

        const snapshot = gatherSnapshot(file("a.md"));
        expect(snapshot.resolvedTargets).toEqual({});
    });
});

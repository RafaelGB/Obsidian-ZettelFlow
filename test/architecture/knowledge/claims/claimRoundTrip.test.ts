import { describe, it, expect, jest } from "@jest/globals";
import { __setMockObsidianApi } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { ClaimSourceSchema } from "architecture/knowledge/claims";
import { applyClaim, applySource } from "application/claims";
import { TFile } from "obsidian";

function file(path: string): TFile {
    const made = new TFile();
    made.path = path;
    made.basename = (path.split("/").pop() ?? path).replace(/\.md$/, "");
    made.extension = "md";
    (made as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = {
        ctime: 1,
        mtime: 1,
        size: 10,
    };
    return made;
}

/**
 * The model sees it (#561 AC-7).
 *
 * The door's whole purpose is that the claims accounting stops returning `[]` for every note in the
 * vault. So this does not assert the mutator twice — it takes the frontmatter `applyClaim`
 * produced, hands it to a **real** `KnowledgeIndex`, and asks the model what the note claims. If
 * this fails, the bug is in the shape the door writes, not in the schema.
 */
describe("a stated claim reaches the model (#561)", () => {
    const index = KnowledgeIndex.getInstance();

    function buildWith(stated: Record<string, unknown>): void {
        const files = [file("Notes/real one.md"), file("Notes/real two.md")];
        __setMockObsidianApi({
            vault: { getMarkdownFiles: () => files, on: jest.fn(() => ({})) } as never,
            metadataCache: {
                getFileCache: (target: TFile) => ({
                    frontmatter: target.path === "Notes/real one.md" ? stated : {},
                    tags: [],
                }),
                // A wikilink source is resolved through the cache, exactly as the real snapshot does.
                getFirstLinkpathDest: (name: string) =>
                    files.find((file) => file.basename === name) ?? null,
                resolvedLinks: {},
                on: jest.fn(() => ({})),
            } as never,
        });
        // The same schema the plugin registers at load (`KnowledgeIndexComponent`): without it
        // the model has no opinion about claims at all, and the round trip would prove nothing.
        index.registerSchemas({ claims: new ClaimSourceSchema() });
        index.useSettingsHost({ settings: { excludedPaths: [], thoughtLabPath: "_ZettelFlow/lab" } as never });
        index.build();
    }

    it("calls the note sourced once the door wrote where it came from (#582)", () => {
        // The point of #582: using the door must not leave the note in the `unsourced` category.
        const frontmatter: Record<string, unknown> = {};
        applyClaim(frontmatter, "microservices move complexity");
        applySource(frontmatter, "[[real two]]");
        buildWith(frontmatter);

        const idea = index.getModel().get("Notes/real one.md");
        expect(idea?.maturitySignals.hasSources).toBe(true);
        expect(idea?.claims[0].sources).toEqual([{ ref: "Notes/real two.md", kind: "link" }]);
    });

    it("turns the sentence into the note's claim, and leaves the untouched note empty", () => {
        const frontmatter: Record<string, unknown> = {};
        applyClaim(frontmatter, "microservices move complexity");
        buildWith(frontmatter);

        expect(index.getModel().get("Notes/real one.md")?.claims).toEqual([
            { text: "microservices move complexity", sources: [] },
        ]);
        expect(index.getModel().get("Notes/real two.md")?.claims).toEqual([]);
    });
});

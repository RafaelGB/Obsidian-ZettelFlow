import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { __setMockObsidianApi } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { SemanticRelationSchema } from "architecture/knowledge/relations";
import { TFile } from "obsidian";

interface Note {
    path: string;
    body: string;
    mtime: number;
    size: number;
}

function tfile(note: Note): TFile {
    const file = new TFile();
    file.path = note.path;
    file.basename = note.path.replace(/\.md$/, "");
    file.extension = "md";
    (file as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = {
        ctime: 1,
        mtime: note.mtime,
        size: note.size,
    };
    return file;
}

/** A vault that counts every body it is asked for — the whole point of the measurement. */
function wire(notes: Note[]) {
    const reads: string[] = [];
    const vault = {
        getMarkdownFiles: () => notes.map(tfile),
        cachedRead: (file: TFile) => {
            reads.push(file.path);
            return Promise.resolve(notes.find((note) => note.path === file.path)?.body ?? "");
        },
        on: jest.fn(() => ({})),
    };
    const metadataCache = {
        getFileCache: () => ({ frontmatter: {}, tags: [] }),
        resolvedLinks: {},
        getFirstLinkpathDest: (name: string) => tfile({ path: `${name}.md`, body: "", mtime: 1, size: 1 }),
        on: jest.fn(() => ({})),
    };
    __setMockObsidianApi({ vault: vault as never, metadataCache: metadataCache as never });
    return { reads };
}

function touch(notes: Note[], path: string, body: string): void {
    const note = notes.find((entry) => entry.path === path);
    if (!note) throw new Error(`no note at ${path}`);
    note.body = body;
    note.mtime += 1;
    note.size = body.length;
}

/**
 * Enrichment that only touches what changed (#459).
 *
 * The decision itself is pure and covered by `enrichmentPlan.test.ts`. What this pins down is the
 * behaviour that decision buys: the second pass reads one file instead of the vault, and a
 * relation removed from a note actually leaves the model.
 */
describe("enrichment that only touches what changed (#459)", () => {
    const index = KnowledgeIndex.getInstance();

    beforeEach(() => {
        wire([]);
        index.resetEnrichment();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
    });

    it("reads every note on the first pass", async () => {
        const notes: Note[] = [
            { path: "a.md", body: "supports:: [[b]]", mtime: 1, size: 16 },
            { path: "b.md", body: "plain", mtime: 1, size: 5 },
            { path: "c.md", body: "plain", mtime: 1, size: 5 },
        ];
        const { reads } = wire(notes);
        index.resetEnrichment();
        index.build();
        await index.enrichInlineRelations();
        expect(reads).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("reads one file on the second pass, not the vault", async () => {
        const notes: Note[] = [
            { path: "a.md", body: "supports:: [[b]]", mtime: 1, size: 16 },
            { path: "b.md", body: "plain", mtime: 1, size: 5 },
            { path: "c.md", body: "plain", mtime: 1, size: 5 },
        ];
        const first = wire(notes);
        index.resetEnrichment();
        index.build();
        await index.enrichInlineRelations();
        expect(first.reads).toHaveLength(3);

        touch(notes, "b.md", "supports:: [[c]]");
        const second = wire(notes);
        await index.enrichInlineRelations();
        expect(second.reads).toEqual(["b.md"]);
    });

    it("reads nothing at all when nothing moved", async () => {
        const notes: Note[] = [{ path: "a.md", body: "supports:: [[b]]", mtime: 1, size: 16 }];
        wire(notes);
        index.resetEnrichment();
        index.build();
        await index.enrichInlineRelations();

        const again = wire(notes);
        await index.enrichInlineRelations();
        expect(again.reads).toEqual([]);
    });

    it("lets go of a relation that was deleted from a note", async () => {
        // The bug this issue also fixes: the old pass skipped a note with no interesting inline
        // fields, so removing a `supports::` line left the relation in the model until a restart.
        const notes: Note[] = [
            { path: "a.md", body: "supports:: [[b]]", mtime: 1, size: 16 },
            { path: "b.md", body: "plain", mtime: 1, size: 5 },
        ];
        wire(notes);
        index.resetEnrichment();
        index.build();
        await index.enrichInlineRelations();
        expect(index.getModel().get("a.md")?.relations.some((r) => r.type === "supports")).toBe(true);

        touch(notes, "a.md", "no relations here any more");
        wire(notes);
        await index.enrichInlineRelations();
        expect(index.getModel().get("a.md")?.relations.some((r) => r.type === "supports")).toBe(false);
    });

    it("tries a note again next time when reading it threw", async () => {
        const notes: Note[] = [{ path: "a.md", body: "supports:: [[b]]", mtime: 1, size: 16 }];
        const reads: string[] = [];
        let failing = true;
        __setMockObsidianApi({
            vault: {
                getMarkdownFiles: () => notes.map(tfile),
                cachedRead: (file: TFile) => {
                    reads.push(file.path);
                    return failing ? Promise.reject(new Error("unreadable")) : Promise.resolve(notes[0].body);
                },
                on: jest.fn(() => ({})),
            } as never,
            metadataCache: {
                getFileCache: () => ({ frontmatter: {}, tags: [] }),
                resolvedLinks: {},
                getFirstLinkpathDest: () => null,
                on: jest.fn(() => ({})),
            } as never,
        });
        index.resetEnrichment();
        index.build();
        await index.enrichInlineRelations();
        expect(reads).toEqual(["a.md"]);

        // A file that could not be read must stay "changed": claiming it would leave it stale
        // until its mtime happened to move again.
        failing = false;
        await index.enrichInlineRelations();
        expect(reads).toEqual(["a.md", "a.md"]);
    });

    it("reads everything again after the scope changes", async () => {
        const notes: Note[] = [{ path: "a.md", body: "supports:: [[b]]", mtime: 1, size: 16 }];
        wire(notes);
        index.resetEnrichment();
        index.build();
        await index.enrichInlineRelations();

        const after = wire(notes);
        // A different scope is a different set of notes to enrich, so nothing carries over.
        index.useSettingsHost({ settings: { excludedPaths: [] } as never });
        await index.enrichInlineRelations();
        expect(after.reads).toEqual(["a.md"]);
    });

    it("says whether the first full pass has happened", async () => {
        wire([{ path: "a.md", body: "plain", mtime: 1, size: 5 }]);
        index.resetEnrichment();
        expect(index.hasEnrichedOnce).toBe(false);
        await index.enrichInlineRelations();
        expect(index.hasEnrichedOnce).toBe(true);
    });
});

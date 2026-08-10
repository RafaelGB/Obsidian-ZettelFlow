import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { __setMockObsidianApi, log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { LifecycleStateSchema } from "architecture/knowledge/lifecycle";
import { SemanticRelationSchema } from "architecture/knowledge/relations";
import * as Q from "architecture/knowledge/query/queries";
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

function wire(files: TFile[], resolvedLinks: Record<string, Record<string, number>> = {}) {
    const writes = {
        create: jest.fn(),
        modify: jest.fn(),
        rename: jest.fn(),
        trash: jest.fn(),
    };
    const vault = {
        getMarkdownFiles: () => files,
        on: jest.fn(() => ({})),
        ...writes,
    };
    const processFrontMatter = jest.fn();
    const metadataCache = {
        getFileCache: () => ({ frontmatter: {}, tags: [] }),
        resolvedLinks,
        on: jest.fn(() => ({})),
    };
    __setMockObsidianApi({
        vault: vault as never,
        metadataCache: metadataCache as never,
        fileManager: { processFrontMatter } as never,
    });
    return { writes, processFrontMatter };
}

describe("KnowledgeIndex service", () => {
    beforeEach(() => {
        // reset the singleton's graph to a known empty state for each test
        wire([]);
        KnowledgeIndex.getInstance().build();
    });

    it("build() performs no vault writes and populates the model (AC-1)", () => {
        const { writes, processFrontMatter } = wire([file("a.md"), file("b.md")], {
            "a.md": { "b.md": 1 },
        });
        const index = KnowledgeIndex.getInstance();
        index.build();

        expect(index.status).toBe("ready");
        expect(writes.create).not.toHaveBeenCalled();
        expect(writes.modify).not.toHaveBeenCalled();
        expect(writes.rename).not.toHaveBeenCalled();
        expect(writes.trash).not.toHaveBeenCalled();
        expect(processFrontMatter).not.toHaveBeenCalled();

        expect(index.getModel().size()).toBe(2);
        expect(index.getModel().inNeighbors("b.md")).toEqual(["a.md"]);
    });

    it("getInstance() is a singleton (FR-10)", () => {
        expect(KnowledgeIndex.getInstance()).toBe(KnowledgeIndex.getInstance());
    });

    it("the four event handlers forward single-entry updates to the model (FR-4)", () => {
        wire([]);
        const index = KnowledgeIndex.getInstance();
        index.build();

        index.onCreate(file("a.md"));
        expect(index.getModel().get("a.md")).toBeDefined();

        index.onModify(file("a.md"));
        expect(index.getModel().size()).toBe(1);

        index.onRename(file("renamed.md"), "a.md");
        expect(index.getModel().get("a.md")).toBeUndefined();
        expect(index.getModel().get("renamed.md")).toBeDefined();

        index.onDelete(file("renamed.md"));
        expect(index.getModel().get("renamed.md")).toBeUndefined();
    });

    it("ignores non-markdown files", () => {
        wire([]);
        const index = KnowledgeIndex.getInstance();
        index.build();
        const folderLike = { path: "some/folder", name: "folder" } as unknown as TFile;
        index.onCreate(folderLike);
        expect(index.getModel().size()).toBe(0);
    });

    it("emits a timing log line on build (FR-11)", () => {
        const spy = jest.spyOn(log, "debug");
        wire([file("a.md")]);
        KnowledgeIndex.getInstance().build();
        expect(spy).toHaveBeenCalled();
    });
});

function wireStates(frontmatterByPath: Record<string, Record<string, unknown>>) {
    const files = Object.keys(frontmatterByPath).map(file);
    const processFrontMatter = jest.fn();
    const vault = {
        getMarkdownFiles: () => files,
        on: jest.fn(() => ({})),
        create: jest.fn(),
        modify: jest.fn(),
        rename: jest.fn(),
        trash: jest.fn(),
    };
    const metadataCache = {
        getFileCache: (f: TFile) => ({ frontmatter: frontmatterByPath[f.path] ?? {}, tags: [] }),
        resolvedLinks: {},
        on: jest.fn(() => ({})),
    };
    __setMockObsidianApi({
        vault: vault as never,
        metadataCache: metadataCache as never,
        fileManager: { processFrontMatter } as never,
    });
    return { processFrontMatter };
}

describe("KnowledgeIndex + lifecycle StateSchema (#146)", () => {
    it("classifies notes by state; unstated falls to fleeting; partition totals (AC-5)", () => {
        wireStates({ "a.md": { state: "permanent" }, "b.md": { state: "developing" }, "c.md": {} });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ state: new LifecycleStateSchema() });
        index.build();
        const model = index.getModel();

        expect(Q.byState(model, "permanent").map((i) => i.path)).toEqual(["a.md"]);
        expect(Q.byState(model, "developing").map((i) => i.path)).toEqual(["b.md"]);
        expect(Q.byState(model, "fleeting").map((i) => i.path)).toEqual(["c.md"]); // unstated -> fleeting
        const total = [...Q.statePartition(model).values()].reduce((n, list) => n + list.length, 0);
        expect(total).toBe(model.size());
    });

    it("performs zero facade writes during load/classification (AC-10)", () => {
        const { processFrontMatter } = wireStates({ "a.md": {}, "b.md": { state: "permanent" } });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ state: new LifecycleStateSchema() });
        index.build();
        expect(processFrontMatter).not.toHaveBeenCalled();
    });

    it("re-derives a single note after its state changes (AC-9)", () => {
        const frontmatter: Record<string, Record<string, unknown>> = { "a.md": { state: "fleeting" } };
        wireStates(frontmatter);
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ state: new LifecycleStateSchema() });
        index.build();
        expect(Q.byState(index.getModel(), "fleeting").map((i) => i.path)).toEqual(["a.md"]);

        // simulate the transition write landing in the metadata cache + the modify event
        frontmatter["a.md"].state = "permanent";
        index.onModify(file("a.md"));

        expect(Q.byState(index.getModel(), "permanent").map((i) => i.path)).toEqual(["a.md"]);
        expect(Q.byState(index.getModel(), "fleeting")).toEqual([]);
    });
});

function wireRelations(opts: {
    frontmatter?: Record<string, Record<string, unknown>>;
    resolvedLinks?: Record<string, Record<string, number>>;
    links?: Record<string, string>;
    bodies?: Record<string, string>;
}) {
    const fm = opts.frontmatter ?? {};
    const paths = new Set<string>([
        ...Object.keys(fm),
        ...Object.keys(opts.bodies ?? {}),
        ...Object.keys(opts.resolvedLinks ?? {}),
    ]);
    const files = [...paths].map(file);
    const writes = { create: jest.fn(), modify: jest.fn(), rename: jest.fn(), trash: jest.fn() };
    const processFrontMatter = jest.fn();
    const cachedRead = jest.fn(async (f: TFile) => (opts.bodies ?? {})[f.path] ?? "");
    const vault = { getMarkdownFiles: () => files, on: jest.fn(() => ({})), cachedRead, ...writes };
    const links = opts.links ?? {};
    const metadataCache = {
        getFileCache: (f: TFile) => ({ frontmatter: fm[f.path] ?? {}, tags: [] }),
        resolvedLinks: opts.resolvedLinks ?? {},
        getFirstLinkpathDest: (name: string) => (links[name] ? { path: links[name] } : null),
        on: jest.fn(() => ({})),
    };
    __setMockObsidianApi({
        vault: vault as never,
        metadataCache: metadataCache as never,
        fileManager: { processFrontMatter } as never,
    });
    return { writes, processFrontMatter, cachedRead };
}

describe("KnowledgeIndex + semantic relation schema (#147)", () => {
    it("populates typed edges from frontmatter after registration (AC-1)", () => {
        wireRelations({ frontmatter: { "a.md": { contradicts: ["[[B]]"] }, "b.md": {} }, links: { B: "b.md" } });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
        expect(Q.edgesByType(index.getModel(), "contradicts").map((e) => `${e.from}->${e.to}`)).toEqual([
            "a.md->b.md",
        ]);
    });

    it("keeps a plain [[link]] as a link edge (AC-3)", () => {
        wireRelations({ frontmatter: { "a.md": {}, "d.md": {} }, resolvedLinks: { "a.md": { "d.md": 1 } } });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
        expect(Q.edgesByType(index.getModel(), "link").map((e) => `${e.from}->${e.to}`)).toEqual([
            "a.md->d.md",
        ]);
    });

    it("a target both typed and plain-linked is a single typed edge (AC-4)", () => {
        wireRelations({
            frontmatter: { "a.md": { supports: ["[[B]]"] }, "b.md": {} },
            resolvedLinks: { "a.md": { "b.md": 1 } },
            links: { B: "b.md" },
        });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
        const model = index.getModel();
        expect(Q.edgesByType(model, "supports").map((e) => `${e.from}->${e.to}`)).toEqual(["a.md->b.md"]);
        expect(Q.edgesByType(model, "link")).toEqual([]);
    });

    it("ignores an unknown relation key (AC-5)", () => {
        wireRelations({ frontmatter: { "a.md": { foobar: ["[[B]]"] }, "b.md": {} }, links: { B: "b.md" } });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
        expect(Q.edgesByType(index.getModel(), "foobar")).toEqual([]);
    });
});

describe("KnowledgeIndex.enrichInlineRelations (#147)", () => {
    it("adds inline relations (outgoing + incoming) and performs zero writes (AC-2/AC-7)", async () => {
        const { writes, processFrontMatter } = wireRelations({
            frontmatter: { "a.md": {}, "c.md": {} },
            bodies: { "a.md": "supports:: [[C]]", "c.md": "" },
            links: { C: "c.md" },
        });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
        expect(Q.edgesByType(index.getModel(), "supports")).toEqual([]); // frontmatter-only build

        await index.enrichInlineRelations();

        const model = index.getModel();
        expect(Q.outgoingRelations(model, "a.md", "supports").map((e) => e.to)).toEqual(["c.md"]);
        expect(Q.incomingRelations(model, "c.md", "supports").map((e) => e.from)).toEqual(["a.md"]);
        expect(writes.create).not.toHaveBeenCalled();
        expect(writes.modify).not.toHaveBeenCalled();
        expect(writes.rename).not.toHaveBeenCalled();
        expect(writes.trash).not.toHaveBeenCalled();
        expect(processFrontMatter).not.toHaveBeenCalled();
    });

    it("does not throw or create an edge for an unresolved inline target (AC-9)", async () => {
        wireRelations({
            frontmatter: { "a.md": {} },
            bodies: { "a.md": "supports:: [[Nonexistent]]" },
            links: {},
        });
        const index = KnowledgeIndex.getInstance();
        index.registerSchemas({ relations: new SemanticRelationSchema() });
        index.build();
        await expect(index.enrichInlineRelations()).resolves.toBeUndefined();
        expect(Q.edgesByType(index.getModel(), "supports")).toEqual([]);
    });
});

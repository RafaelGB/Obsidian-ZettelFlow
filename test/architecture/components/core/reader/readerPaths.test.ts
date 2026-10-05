import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Menu, Platform, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { readingPathOptions } from "architecture/knowledge/state";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { parseReaderState } from "architecture/components/core/reader/readerContract";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { notesUnder } from "architecture/components/core/reader/readerPaths";
import {
    normalizeResume,
    readingKey,
    recordResume,
    resumeOf,
    RESUME_LIMIT,
} from "architecture/components/core/reader/readerResume";
import { ReadingPathModal, pendingResume, readSelection } from "architecture/components/core/reader/readingChooser";
import { ReaderComponent } from "starters/zcomponents/ReaderComponent";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

function md(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

/** A workspace that records where the reader opened, as in the R1 tests. */
function workspace() {
    const fresh = { setViewState: jest.fn(async () => undefined) } as unknown as WorkspaceLeaf & { setViewState: jest.Mock };
    const ws = {
        leftSplit: { collapsed: false, collapse() {}, expand() {} },
        rightSplit: { collapsed: false, collapse() {}, expand() {} },
        getMostRecentLeaf: () => null,
        getLeavesOfType: () => [],
        getLeaf: () => fresh,
        revealLeaf: async () => undefined,
        iterateAllLeaves: () => undefined,
        setActiveLeaf: () => undefined,
    };
    return { app: { workspace: ws } as never, fresh };
}

beforeEach(() => {
    resetReaderWorkspace();
    (Platform as { isMobile: boolean }).isMobile = false;
});

describe("resume where you left off (#669)", () => {
    it("keys a reading by how it was chosen, and a picked set by its members in any order", () => {
        expect(readingKey("argument", "a.md")).toBe("argument:a.md");
        expect(readingKey("selection", "a.md", ["b.md", "a.md"])).toBe(readingKey("selection", "b.md", ["a.md", "b.md"]));
        expect(readingKey("selection", "a.md", ["a.md", "b.md"])).not.toContain("a.md");
    });

    it("remembers a reading part-way and forgets it at the start or the last chapter", () => {
        let map = recordResume({}, "around:a.md", 2, 5, 100);
        expect(resumeOf(map, "around:a.md")).toEqual({ chapter: 2, total: 5, at: 100 });
        map = recordResume(map, "around:a.md", 4, 5, 200);
        expect(resumeOf(map, "around:a.md")).toBeNull();
        expect(resumeOf(recordResume({}, "x", 0, 5, 1), "x")).toBeNull();
    });

    it("keeps only the most recent readings", () => {
        let map = {};
        for (let i = 0; i < RESUME_LIMIT + 5; i++) map = recordResume(map, `around:${i}.md`, 1, 4, i);
        expect(Object.keys(map)).toHaveLength(RESUME_LIMIT);
        expect(resumeOf(map, "around:0.md")).toBeNull();
        expect(resumeOf(map, `around:${RESUME_LIMIT + 4}.md`)).not.toBeNull();
    });

    it("reads a stored map without trusting it", () => {
        expect(normalizeResume({ ok: { chapter: 1, total: 3, at: 5 }, bad: { chapter: "1" }, worse: null })).toEqual({
            ok: { chapter: 1, total: 3, at: 5 },
        });
        expect(normalizeResume("nope")).toEqual({});
    });
});

describe("the view state carries how the reading was chosen (#669)", () => {
    it("parses the kind and a picked set, and drops what it does not know", () => {
        expect(parseReaderState({ seed: "a.md", kind: "selection", paths: ["a.md", 3, "b.md"] })).toEqual({
            seed: "a.md",
            kind: "selection",
            paths: ["a.md", "b.md"],
        });
        expect(parseReaderState({ seed: "a.md", kind: "teleport" })).toEqual({ seed: "a.md" });
    });

    it("reads a picked set in the order it was picked, and remembers where you are", async () => {
        const files: Record<string, string> = { "a.md": "A.", "b.md": "B.", "c.md": "C." };
        const app = {
            workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn() },
            vault: {
                getAbstractFileByPath: (path: string) => (files[path] !== undefined ? md(path) : null),
                cachedRead: async (f: TFile) => files[f.path],
                getMarkdownFiles: () => [],
            },
            metadataCache: { getFirstLinkpathDest: () => null },
        };
        const content = new DomNode();
        const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf;
        const plugin = { settings: {} as { readerResume?: Record<string, unknown> }, saveSettings: jest.fn(async () => undefined) };
        const view = new ReaderView(leaf, plugin as never);
        await view.setState({ seed: "c.md", kind: "selection", paths: ["c.md", "a.md", "b.md"] }, {} as never);
        await view.onOpen();
        await flush();
        expect(view.getState()).toMatchObject({ seed: "c.md", kind: "selection", paths: ["c.md", "a.md", "b.md"], chapter: 0 });
        expect(content.oneByClass("reader-path-title").textContent).toBe("c · Your selection");
        // Turn the page: the place is kept under the set's key.
        (view as unknown as { show(i: number): void }).show(1);
        expect(resumeOf(normalizeResume(plugin.settings.readerResume), readingKey("selection", "c.md", ["c.md", "a.md", "b.md"]))).toMatchObject({
            chapter: 1,
            total: 3,
        });
        await view.onClose();
    });
});

describe("how do you want to read it? (#669)", () => {
    const model = buildModel([
        idea("seed.md", "literature", [{ to: "B.md", type: "supports" }, { to: "C.md" }]),
        idea("B.md", "permanent"),
        idea("C.md", "permanent"),
        idea("D.md", "permanent", [{ to: "seed.md", type: "contradicts" }]),
    ]);
    const options = readingPathOptions(model, "seed.md");

    function open(host: unknown = null) {
        const { app, fresh } = workspace();
        const modal = new ReadingPathModal(app, "seed.md", options, host as never);
        const content = new DomNode();
        (modal as unknown as { contentEl: DomNode }).contentEl = content;
        modal.open();
        return { modal, content, fresh };
    }

    it("offers each way through the note, with a picture, a promise and the chapters it reads", () => {
        const { content } = open();
        expect(options.map((o) => o.kind)).toEqual(expect.arrayContaining(["around", "argument"]));
        const cards = content.byClass("reader-chooser-card");
        expect(cards).toHaveLength(options.length);
        expect(cards.every((card) => card.find((el) => el.tag === "svg") !== undefined)).toBe(true);
        expect(cards[0].hasClass("is-active")).toBe(true);
        expect(content.byClass("reader-chooser-chip").map((chip) => chip.textContent)).toEqual(
            options[0].path.chapters.map((chapter) => chapter.path.replace(/\.md$/, ""))
        );
    });

    it("previews the way you pick, and opens the reader on it", async () => {
        const { content, fresh } = open();
        const argument = options.findIndex((o) => o.kind === "argument");
        content.byClass("reader-chooser-card")[argument].click();
        expect(content.byClass("reader-chooser-card")[argument].hasClass("is-active")).toBe(true);
        content.oneByClass("reader-chooser-start").click();
        await flush();
        expect(fresh.setViewState).toHaveBeenCalledWith({
            type: "zettelflow-reader",
            state: { seed: "seed.md", chapter: 0, kind: "argument" },
            active: true,
        });
    });

    it("offers to resume a reading of this note left part-way", async () => {
        const host = { settings: { readerResume: { "argument:seed.md": { chapter: 2, total: 4, at: 10 } } } };
        expect(pendingResume(host, "seed.md", options)).toEqual({ kind: "argument", entry: { chapter: 2, total: 4, at: 10 } });
        const { content, fresh } = open(host);
        const resume = content.oneByClass("reader-chooser-resume");
        expect(resume.textContent).toBe("Argument · Resume at chapter 3 of 4");
        resume.click();
        await flush();
        expect(fresh.setViewState).toHaveBeenCalledWith({
            type: "zettelflow-reader",
            state: { seed: "seed.md", chapter: 2, kind: "argument" },
            active: true,
        });
    });
});

describe("read these, read this folder (#669)", () => {
    it("reads the picked notes as a selection, leaving out what is not a note", async () => {
        const { app, fresh } = workspace();
        readSelection(app, ["b.md", "pic.png", "a.md"], null);
        await flush();
        const state = (fresh.setViewState.mock.calls[0][0] as { state: Record<string, unknown> }).state;
        expect(state.kind).toBe("selection");
        expect(state.paths).toEqual(["a.md", "b.md"]);
        expect(state.seed).toBe("a.md");
    });

    it("reads nothing when nothing picked is a note", async () => {
        const { app, fresh } = workspace();
        readSelection(app, ["pic.png"], null);
        await flush();
        expect(fresh.setViewState).not.toHaveBeenCalled();
    });

    it("finds every note under a folder, at any depth", () => {
        const root = new TFolder();
        const sub = new TFolder();
        const png = new TFile();
        png.path = "f/pic.png";
        png.extension = "png";
        sub.children = [md("f/sub/b.md")];
        root.children = [md("f/a.md"), png, sub];
        expect(notesUnder(root)).toEqual(["f/a.md", "f/sub/b.md"]);
    });

    it("offers Read from here on a note, Read this folder on a folder and Read these on a multi-selection", () => {
        const handlers: Record<string, (...args: unknown[]) => void> = {};
        const plugin = {
            app: {
                workspace: { on: (name: string, fn: (...args: unknown[]) => void) => ((handlers[name] = fn), {}), getActiveFile: () => null },
            },
            addCommand: jest.fn(),
            registerEvent: jest.fn(),
        };
        new ReaderComponent(plugin as never).onLoad();

        const noteMenu = new Menu();
        handlers["file-menu"](noteMenu, md("a.md"));
        expect(noteMenu.items.map((i) => i.title)).toEqual(["Read from here"]);

        const folder = new TFolder();
        folder.children = [md("f/a.md")];
        const folderMenu = new Menu();
        handlers["file-menu"](folderMenu, folder);
        expect(folderMenu.items.map((i) => i.title)).toEqual(["Read this folder"]);

        const empty = new Menu();
        handlers["file-menu"](empty, new TFolder());
        expect(empty.items).toEqual([]);

        const many = new Menu();
        handlers["files-menu"](many, [md("a.md"), md("b.md")]);
        expect(many.items.map((i) => i.title)).toEqual(["Read these"]);

        const one = new Menu();
        handlers["files-menu"](one, [md("a.md")]);
        expect(one.items).toEqual([]);
    });
});

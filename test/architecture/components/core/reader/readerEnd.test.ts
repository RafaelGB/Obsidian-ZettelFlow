import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { ReadingExportModal, type ExportResult } from "architecture/components/core/reader/readerExport";
import { ReadingPathModal } from "architecture/components/core/reader/readingChooser";
import type { SavedReading } from "architecture/components/core/reader/readerSaved";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

/** A three-chapter reading (notes/a → notes/b → notes/c), picked as a selection. */
function mount(settings: Record<string, unknown> = {}) {
    const files: Record<string, string> = {
        "notes/a.md": "A links to [[x]].",
        "notes/b.md": "The body of B.",
        "notes/c.md": "The body of C.",
        "x.md": "X, outside the reading.",
    };
    const surface = { setViewState: jest.fn(async () => undefined) };
    const app = {
        workspace: {
            requestSaveLayout: jest.fn(),
            openLinkText: jest.fn(),
            iterateAllLeaves: () => undefined,
            setActiveLeaf: jest.fn(),
            trigger: jest.fn(),
            getLeavesOfType: () => [],
            getLeaf: () => surface,
            revealLeaf: jest.fn(async () => undefined),
        },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
            modify: jest.fn(),
            process: jest.fn(),
            create: jest.fn(),
        },
        metadataCache: {
            getFirstLinkpathDest: (link: string) => (files[`${link}.md`] !== undefined ? file(`${link}.md`) : null),
        },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const plugin = { settings, saveSettings: jest.fn(async () => undefined) };
    const view = new ReaderView(leaf, plugin);
    return { view, app, content, leaf, plugin, surface };
}

async function open(settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    const m = mount(settings);
    await m.view.setState({ seed: "notes/a.md", kind: "selection", paths: ["notes/a.md", "notes/b.md", "notes/c.md"], ...extra }, {} as never);
    await m.view.onOpen();
    await flush();
    return m;
}

const key = (content: DomNode, k: string) => content.fire("keydown", { key: k, target: content });
const title = (content: DomNode) => content.oneByClass("reader-chapter-title").textContent;
const action = (content: DomNode, name: string) =>
    content.byClass("reader-end-action").find((b) => b.oneByClass("reader-end-action-name").textContent === name)!;

async function toEnd(content: DomNode) {
    for (let i = 0; i < 3; i++) {
        key(content, "ArrowRight");
        await flush();
    }
}

describe("the end of a path (#672)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
    });
    afterEach(() => jest.restoreAllMocks());

    it("past the last chapter, an end card says what the reading added up to — and nothing at zero", async () => {
        const { content } = await open();
        await toEnd(content);
        expect(content.byClass("reader-end")).toHaveLength(1);
        expect(content.byClass("reader-body")).toHaveLength(0);
        expect(content.oneByClass("reader-count").textContent).toBe("The end of the path");
        expect(title(content)).toBe("a");
        expect(content.oneByClass("reader-end-lede").textContent).toBe("Read as: Your selection.");
        const stats = content.byClass("reader-end-stat").map((s) => `${s.oneByClass("reader-end-stat-value").textContent} ${s.oneByClass("reader-end-stat-label").textContent}`);
        // No detours, highlights or margin notes were made: no "0 detours" scoreboard.
        expect(stats).toEqual(["1 minute", "3 notes read"]);
        expect(content.byClass("reader-end-action-name").map((n) => n.textContent)).toEqual([
            "Save this path",
            "Export as one document",
            "Cultivate the thesis",
            "Read it again",
        ]);
        // A picked set has no other way through it.
        expect(content.byClass("reader-end-another")).toHaveLength(0);
    });

    it("the last chapter's Finish leads to the end card, not out of the reader", async () => {
        const { content, leaf } = await open();
        key(content, "ArrowRight");
        await flush();
        key(content, "ArrowRight");
        await flush();
        const finish = content.oneByClass("reader-next-button");
        expect(finish.textContent).toBe("Finish");
        finish.click();
        await flush();
        expect(content.byClass("reader-end")).toHaveLength(1);
        expect(leaf.detach).not.toHaveBeenCalled();
    });

    it("counts a detour taken on the way", async () => {
        const { view, content } = await open();
        (view as unknown as { takeDetour(path: string): void }).takeDetour("x.md");
        await flush();
        await toEnd(content);
        // The detour is left on the way to the end: back to the path, then on.
        key(content, "ArrowRight");
        await flush();
        const labels = content.byClass("reader-end-stat-label").map((l) => l.textContent);
        expect(labels).toContain("detour");
    });

    it("back from the end is the last chapter; Esc from the end leaves the reader", async () => {
        const { content, leaf } = await open();
        await toEnd(content);
        key(content, "ArrowLeft");
        await flush();
        expect(title(content)).toBe("c");
        await toEnd(content);
        key(content, "Escape");
        expect(leaf.detach).toHaveBeenCalled();
    });

    it("read it again starts from chapter 1", async () => {
        const { content } = await open();
        await toEnd(content);
        action(content, "Read it again").click();
        await flush();
        expect(title(content)).toBe("a");
        expect(content.byClass("reader-end")).toHaveLength(0);
    });

    it("saves the path by name, in order, in plugin data — and the reader takes the name", async () => {
        const settings: Record<string, unknown> = {};
        const { content, plugin } = await open(settings);
        await toEnd(content);
        action(content, "Save this path").click();
        const input = content.oneByClass("reader-end-save-form").find((el) => el.tag === "input")!;
        expect((input as unknown as { value: string }).value).toBe("a · Your selection");
        (input as unknown as { value: string }).value = "  Field notes  ";
        content.oneByClass("reader-end-save-form").find((el) => el.tag === "button" && el.textContent === "Save")!.click();
        await flush();
        const saved = settings.readerSaved as SavedReading[];
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({ name: "Field notes", kind: "selection", seed: "notes/a.md", paths: ["notes/a.md", "notes/b.md", "notes/c.md"] });
        expect(plugin.saveSettings).toHaveBeenCalled();
        expect(content.oneByClass("reader-path-title").textContent).toBe("Field notes");
        expect(action(content, "Saved as Field notes")).toBeDefined();
    });

    it("saving again keeps one entry, renamed", async () => {
        const settings: Record<string, unknown> = {};
        const { content } = await open(settings);
        await toEnd(content);
        for (const name of ["First", "Second"]) {
            content.byClass("reader-end-action")[0].click();
            const form = content.oneByClass("reader-end-save-form");
            (form.find((el) => el.tag === "input") as unknown as { value: string }).value = name;
            form.find((el) => el.tag === "button" && el.textContent === "Save")!.click();
            await flush();
        }
        expect((settings.readerSaved as SavedReading[]).map((s) => s.name)).toEqual(["Second"]);
    });

    it("hands the thesis to Cultivate, giving the workspace back first", async () => {
        const { content, leaf, surface } = await open();
        await toEnd(content);
        action(content, "Cultivate the thesis").click();
        await flush();
        expect(leaf.detach).toHaveBeenCalled();
        expect(surface.setViewState).toHaveBeenCalledWith({
            type: "zettelflow-home",
            active: true,
            state: { mode: "cultivate", target: "notes/a.md" },
        });
    });

    it("export opens the preview first — then the outcome, with Open and Undo, on the card", async () => {
        let modal: ReadingExportModal | null = null;
        jest.spyOn(ReadingExportModal.prototype, "open").mockImplementation(function (this: ReadingExportModal) {
            modal = this;
        });
        const { content, app } = await open();
        await toEnd(content);
        action(content, "Export as one document").click();
        expect(modal).not.toBeNull();
        const plan = (modal as unknown as { plan: { folder: string; fileName: string; chapters: string[] } }).plan;
        // The seed's folder, the reading's name, the chapters in order.
        expect(plan).toMatchObject({ folder: "notes", fileName: "a · Your selection", chapters: ["notes/a.md", "notes/b.md", "notes/c.md"] });
        const done = (modal as unknown as { onDone(result: ExportResult): void }).onDone;
        done({ ok: true, path: "notes/a.md 2" });
        await flush();
        expect(content.oneByClass("reader-end-status").textContent).toContain("Exported to notes/a.md 2.");
        content.byClass("reader-end-status-link").find((b) => b.textContent === "Open")!.click();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("notes/a.md 2", "", "tab");
        done({ ok: false });
        await flush();
        expect(content.oneByClass("reader-end-status").textContent).toBe("Could not export. Nothing was written.");
    });

    it("a saved reading opens under its name", async () => {
        const { content } = await open({}, { name: "Field notes" });
        expect(content.oneByClass("reader-path-title").textContent).toBe("Field notes");
    });
});

describe("the export preview (#672)", () => {
    function preview() {
        const modal = new ReadingExportModal(
            {} as never,
            { title: "a", intro: "A reading", chapters: ["notes/a.md", "notes/b.md"], folder: "notes", fileName: "a" },
            jest.fn()
        );
        const content = new DomNode();
        (modal as unknown as { contentEl: DomNode }).contentEl = content;
        return { modal, content };
    }

    it("shows the chapters, embeds by default, and offers a copy of the text", () => {
        const { modal, content } = preview();
        jest.spyOn(modal as unknown as { render(): void }, "render");
        (modal as unknown as { render(): void }).render();
        expect(content.byClass("reader-export-chapters")[0].children.map((li) => li.textContent)).toEqual(["a", "b"]);
        const modes = content.byClass("reader-export-mode");
        expect(modes.map((m) => m.oneByClass("reader-export-mode-name").textContent)).toEqual(["Embed each note", "Copy the text"]);
        expect(modes[0].hasClass("is-active")).toBe(true);
        modes[1].click();
        expect(content.byClass("reader-export-mode")[1].hasClass("is-active")).toBe(true);
        expect(content.oneByClass("reader-export-appendix").textContent).toBe("No highlights on these notes yet, so no appendix.");
    });

    it("cancel writes nothing", () => {
        const { modal, content } = preview();
        (modal as unknown as { render(): void }).render();
        const close = jest.spyOn(modal, "close");
        content.findAll((el) => el.tag === "button" && el.textContent === "Cancel")[0].click();
        expect(close).toHaveBeenCalled();
        expect((modal as unknown as { onDone: jest.Mock }).onDone).not.toHaveBeenCalled();
    });
});

describe("your saved paths in the chooser (#672)", () => {
    const entry: SavedReading = { id: "r1", name: "Field notes", kind: "selection", seed: "notes/a.md", paths: ["notes/a.md", "notes/b.md"], at: 1 };

    function chooser(saved: SavedReading[]) {
        const host = { settings: { readerSaved: saved }, saveSettings: jest.fn(async () => undefined) };
        const fresh = { setViewState: jest.fn(async () => undefined) };
        const app = {
            workspace: {
                leftSplit: { collapsed: false, collapse() {}, expand() {} },
                rightSplit: { collapsed: false, collapse() {}, expand() {} },
                getMostRecentLeaf: () => null,
                getLeavesOfType: () => [],
                getLeaf: () => fresh,
                revealLeaf: async () => undefined,
                iterateAllLeaves: () => undefined,
                setActiveLeaf: () => undefined,
            },
        };
        const modal = new ReadingPathModal(app as never, "notes/b.md", [], host);
        const content = new DomNode();
        (modal as unknown as { contentEl: DomNode }).contentEl = content;
        modal.open();
        return { content, host, fresh };
    }

    beforeEach(() => resetReaderWorkspace());

    it("lists the saved paths through the note, and reads one again under its name", async () => {
        const { content, fresh } = chooser([entry]);
        expect(content.oneByClass("reader-saved-heading").textContent).toBe("Your saved paths");
        expect(content.oneByClass("reader-saved-name").textContent).toBe("Field notes");
        expect(content.oneByClass("reader-saved-meta").textContent).toBe("2 chapters");
        content.oneByClass("reader-saved-open").click();
        await flush();
        expect(fresh.setViewState).toHaveBeenCalledWith(
            expect.objectContaining({
                state: expect.objectContaining({ seed: "notes/a.md", kind: "selection", paths: ["notes/a.md", "notes/b.md"], name: "Field notes" }),
            })
        );
    });

    it("renames in place and deletes, in plugin data", async () => {
        const { content, host } = chooser([entry]);
        content.findAll((el) => el.getAttribute("aria-label") === "Rename")[0].click();
        const input = content.oneByClass("reader-saved-input") as unknown as { value: string };
        input.value = "Renamed";
        content.findAll((el) => el.tag === "button" && el.textContent === "Save")[0].click();
        await flush();
        expect(host.settings.readerSaved.map((s) => s.name)).toEqual(["Renamed"]);
        content.findAll((el) => el.getAttribute("aria-label") === "Delete")[0].click();
        await flush();
        expect(host.settings.readerSaved).toEqual([]);
        expect(content.byClass("reader-saved")).toHaveLength(0);
        expect(host.saveSettings).toHaveBeenCalledTimes(2);
    });

    it("says nothing about saved paths that do not pass through the note", () => {
        const { content } = chooser([{ ...entry, seed: "z.md", paths: ["z.md"] }]);
        expect(content.byClass("reader-saved")).toHaveLength(0);
    });
});

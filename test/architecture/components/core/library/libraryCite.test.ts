/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { LibraryView } from "architecture/components/core/library/LibraryView";
import { citeSourceOf } from "architecture/components/core/library/libraryCite";

/**
 * **Cite this book** (#768 FR-1, FR-4, FR-5): in a source's detail in the Library, the same panel the
 * Reader opens, with no passage — drawn from the book's note wherever it is kept, writing nothing —
 * and the *Citation key* field that ships with it (§XIII).
 */

const BOOK = "Books/Thinking, Fast and Slow.epub";
const PAPER = "Papers/Reference class forecasting.pdf";
const ARTICLE = "Clippings/The web we lost.md";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.basename = f.name.replace(/\.[^.]+$/, "");
    f.extension = path.split(".").pop() ?? "";
    (f as unknown as { stat: unknown }).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const library = {
    [BOOK]: { size: 10, mtime: 20, title: "Thinking, Fast and Slow", author: "Daniel Kahneman", chapters: 38 },
    [PAPER]: { size: 10, mtime: 20, title: "Reference class forecasting", chapters: 12 },
};

/** The book's note kept apart from the book, in *Reading notes/*: found by its link. */
const NOTES: Record<string, Record<string, unknown>> = {
    "Reading notes/Thinking.md": { book: `[[${BOOK}]]`, title: "Thinking, Fast and Slow", author: ["Daniel Kahneman"], year: 2011, publisher: "Farrar, Straus and Giroux" },
    "Reading notes/Forecasting.md": { book: `[[${PAPER}]]`, author: ["Bent Flyvbjerg"] },
    [ARTICLE]: { title: "The web we lost", author: ["[[Anil Dash]]"], published: "2012-12-13", source: "https://example.com/lost", created: "2025-03-02" },
};

function mount(settings: Record<string, unknown> = { library }) {
    const sources = [BOOK, PAPER].map(file);
    const markdown = Object.keys(NOTES).map(file);
    const on = () => ({});
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), getActiveFile: () => null, getLastOpenFiles: () => [], on },
        vault: {
            getFiles: () => [...sources, ...markdown],
            getMarkdownFiles: () => markdown,
            getAbstractFileByPath: (path: string) => sources.find((f) => f.path === path) ?? markdown.find((f) => f.path === path) ?? null,
            create: jest.fn(),
            modify: jest.fn(),
            process: jest.fn(),
            on,
        },
        metadataCache: {
            getFileCache: (f: TFile) => (NOTES[f.path] ? { frontmatter: NOTES[f.path] } : null),
            getFirstLinkpathDest: (link: string) => sources.find((s) => s.path === link) ?? null,
            on,
        },
    };
    const writes = {
        create: jest.fn(async (request: any) => ({ file: file(`Library/${request.title}.md`), batch: "b1", fields: { book: `[[${request.source}]]`, ...request.change } })),
        edit: jest.fn(async (f: TFile) => ({ file: f, batch: "b2" })),
        adopt: jest.fn(),
        undo: jest.fn(),
        noteAt: (path: string) => file(path),
    };
    const content = new DomNode();
    const host = { settings: { ...settings }, saveSettings: jest.fn(async () => undefined) };
    const view = new LibraryView(new WorkspaceLeaf(app, content), host, { details: { port: writes as never, suggest: () => undefined } });
    const panel = () => content.byClass("reader-cite")[0];
    const text = () => panel().oneByClass("reader-cite-text").textContent;
    const chip = (form: string) => panel().find((node) => node.attrs?.["data-form"] === form)!;
    const citeButton = () => content.find((node) => node.attrs?.["data-zf-cite"] !== undefined)!;
    const field = (name: string) => content.find((el) => el.attrs.id === `zf-book-${name}`)!;
    return { view, app, content, host, writes, panel, text, chip, citeButton, field };
}

const focused: DomNode[] = [];
const realFocus = DomNode.prototype.focus;
afterEach(() => {
    DomNode.prototype.focus = realFocus;
    focused.splice(0);
    delete (globalThis as any).navigator?.clipboard;
});

describe("what a citation is drawn from (FR-3)", () => {
    it("reads the book's note by its link, the article's own frontmatter, and nothing for a book with no note", () => {
        const { app } = mount();
        expect(citeSourceOf(app as never, BOOK, "epub", "x")).toMatchObject({ kind: "book", details: { year: 2011, author: ["Daniel Kahneman"] } });
        expect(citeSourceOf(app as never, PAPER, "pdf", "Reference class forecasting")).toMatchObject({ kind: "paper", details: { author: ["Bent Flyvbjerg"] } });
        expect(citeSourceOf(app as never, "Books/none.epub", "epub", "None")).toEqual({ kind: "book", fileTitle: "None" });
        expect(citeSourceOf(app as never, ARTICLE, "article", "The web we lost")).toMatchObject({ kind: "article", url: "https://example.com/lost", details: { author: ["Anil Dash"], year: 2012 } });
    });
});

describe("Cite this book, in the detail (FR-1, AC-5)", () => {
    it("opens the panel from the button with no passage, its key form reading the proposed key", async () => {
        const { view, content, panel, text, chip, citeButton, writes, app } = mount();
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        expect(citeButton().textContent).toBe("Cite this book");
        citeButton().click();
        expect(panel().attrs["aria-label"]).toBe("Cite this book");
        expect(panel().hasClass("zettelkasten-flow__reader-cite--library")).toBe(true);
        chip("key").click();
        expect(text()).toBe("[@kahneman2011thinking]");
        chip("inline").click();
        expect(text()).toBe("(Kahneman, 2011)");
        // Nothing written: not the note, not the book.
        await flush();
        expect(writes.create).not.toHaveBeenCalled();
        expect(writes.edit).not.toHaveBeenCalled();
        expect(app.vault.create).not.toHaveBeenCalled();
        expect(app.vault.modify).not.toHaveBeenCalled();
    });

    it("copies exactly what it shows to the clipboard, and only on Copy (FR-7, FR-8)", async () => {
        const writeText = jest.fn(async (_text: string) => undefined);
        Object.defineProperty((globalThis as any).navigator ?? ((globalThis as any).navigator = {}), "clipboard", { value: { writeText }, configurable: true });
        const { view, panel, text, citeButton } = mount();
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        citeButton().click();
        expect(writeText).not.toHaveBeenCalled();
        panel().find((node) => node.attrs?.["data-zf-cite-copy"] !== undefined)!.click();
        expect(writeText).toHaveBeenCalledWith(text());
    });

    it("remembers the form in the plugin's data", async () => {
        const { view, chip, citeButton, host } = mount();
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        citeButton().click();
        chip("bibtex").click();
        expect(host.settings.citeForm).toBe("bibtex");
        expect(host.saveSettings).toHaveBeenCalled();
    });

    it("Esc puts the panel away first, and the detail stays; closing the detail takes it too", async () => {
        const { view, content, citeButton } = mount();
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        citeButton().click();
        const esc = (view as any).scope.keys.find((k: any) => k.key === "Escape");
        expect(esc.func({}, {})).toBe(false);
        expect(content.byClass("reader-cite")).toHaveLength(0);
        expect(view.getState().detail).toBe(BOOK);
        citeButton().click();
        expect(content.byClass("reader-cite")).toHaveLength(1);
        esc.func({}, {});
        esc.func({}, {});
        expect(view.getState().detail).toBeUndefined();
    });

    it("Add it puts the cursor in the field it names, in the Details below", async () => {
        DomNode.prototype.focus = function (this: DomNode) {
            focused.push(this);
        };
        const { view, panel, citeButton, field } = mount();
        await view.onOpen();
        await view.setState({ detail: PAPER }, {} as never);
        citeButton().click();
        panel().find((node) => node.attrs?.["data-form"] === "inline")!.click();
        expect(panel().oneByClass("reader-cite-missing").textContent).toBe("No year in this paper's details · Add it");
        panel().find((node) => node.attrs?.["data-zf-cite-add"] === "year")!.click();
        expect(focused[focused.length - 1]).toBe(field("year"));
    });
});

describe("the detail opened at a field (FR-4: Add it from the Reader)", () => {
    it("focuses the field the view state names, once", async () => {
        DomNode.prototype.focus = function (this: DomNode) {
            focused.push(this);
        };
        const { view, field } = mount();
        await view.onOpen();
        await view.setState({ detail: PAPER, field: "year" }, {} as never);
        expect(focused).toContain(field("year"));
        expect(view.getState().field).toBeUndefined();
    });
});

describe("the Citation key field (FR-5, AC-6)", () => {
    it("shows the proposed key until you set your own, and saves citekey like the other fields", async () => {
        const { view, field, writes } = mount();
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        expect(field("citekey").attrs.placeholder).toBe("kahneman2011thinking");
        expect(field("citekey").value).toBe("");
        field("citekey").value = "dk-thinking";
        field("citekey").fire("blur");
        await flush();
        expect(writes.edit).toHaveBeenCalledTimes(1);
        expect(writes.edit.mock.calls[0][1]).toEqual({ citekey: "dk-thinking" });
    });

    it("refuses a key with a space, on the spot, and writes nothing", async () => {
        const { view, field, writes, content } = mount();
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        field("citekey").value = "two words";
        field("citekey").fire("blur");
        await flush();
        expect(writes.edit).not.toHaveBeenCalled();
        expect(field("citekey").attrs["aria-invalid"]).toBe("true");
        expect(content.oneByClass("shelf-details-error").textContent).toBe("A citation key starts with a letter or a digit, and has no spaces.");
    });
});

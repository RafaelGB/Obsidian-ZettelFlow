/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Setting, TFile, WorkspaceLeaf, __captureSettings } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion } from "../../../../support/motionDom";

// The folder suggest reaches the live app; under jest it only hands back what a choice would call.
jest.mock("architecture/settings", () => ({ FolderSuggest: class {} }));
const openReader = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("architecture/components/core/reader/openReader", () => ({ openReader: (...args: unknown[]) => openReader(...args) }));
const beginOpenShot = jest.fn((..._args: unknown[]) => true);
jest.mock("architecture/components/core/reader/readerShot", () => ({ beginOpenShot: (...args: unknown[]) => beginOpenShot(...args) }));

import { LibraryView } from "architecture/components/core/library/LibraryView";
import { readingSettingsGroup } from "config/modals/handlers/readingSettingsGroup";
import { DEFAULT_SETTINGS } from "config/typing";

const DAY = 86_400_000;
const SLOW = "Clippings/The case for slow software.md";
const OLD = "Clippings/2024/Old essay.md";
const BOOK = "Books/Thinking, Fast and Slow.epub";
const NEW_BOOK = "Books/Arrived.epub";

function file(path: string, ctime = 1): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.basename = f.name.replace(/\.[^.]+$/, "");
    f.extension = path.split(".").pop() ?? "";
    (f as unknown as { stat: unknown }).stat = { size: 10, mtime: 20, ctime };
    return f;
}

const today = (offset = 0) => {
    const d = new Date(Date.now() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const clips: Record<string, Record<string, unknown>> = {
    [SLOW]: { title: "The case for slow software", source: "https://example.com/slow-software", author: ["[[Jane Doe]]"], published: "2025-03-02", created: today(DAY), tags: ["clippings"] },
    [OLD]: { title: "Old essay", source: "https://blog.example.org/old", created: "2024-01-01" },
    // In the folder, but its source is a note: not an article.
    "Clippings/Not one.md": { source: "[[Some note]]" },
    // A clippings tag outside the folder is not enough.
    "Inbox/Tagged.md": { source: "https://example.com/x", tags: ["clippings"] },
};

function mount(settings: Record<string, unknown> = {}, extra: string[] = []) {
    const sources = [file(BOOK), ...extra.map((path) => file(path, Date.now()))];
    const markdown = Object.keys(clips).map((path) => file(path, Date.now() - 400 * DAY));
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const on = (name: string, fn: (...args: unknown[]) => void) => {
        (handlers[name] ??= []).push(fn);
        return { name };
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), getActiveFile: () => null, getLastOpenFiles: () => [], on },
        vault: {
            getFiles: () => [...sources, ...markdown],
            getMarkdownFiles: () => markdown,
            getAbstractFileByPath: (path: string) => [...sources, ...markdown].find((f) => f.path === path) ?? null,
            create: jest.fn(),
            modify: jest.fn(),
            process: jest.fn(),
            on,
        },
        metadataCache: {
            getFileCache: (f: TFile) => (clips[f.path] ? { frontmatter: clips[f.path] } : null),
            getFirstLinkpathDest: () => null,
            on,
        },
    };
    const writes = {
        create: jest.fn(),
        edit: jest.fn(),
        adopt: jest.fn(),
        editArticle: jest.fn(async (f: TFile) => ({ file: f, batch: "b1" })),
        undo: jest.fn(),
        noteAt: (path: string) => file(path),
    };
    const content = new DomNode();
    const host = { settings: { ...settings } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const view = new LibraryView(new WorkspaceLeaf(app, content), host, { details: { port: writes as never, suggest: () => undefined } });
    return { view, app, content, host, writes, handlers, sources };
}

const texts = (content: DomNode, cls: string) => content.byClass(cls).map((el) => el.textContent);
const chips = (content: DomNode) => content.oneByClass("shelf-bar").byClass("shelf-filter--kind");
/** A book on the shelves (#820), by id. */
const book = (content: DomNode, id: string) => content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === id)!;
/** What each book says to a screen reader: *Open title, byline, where it stands*. */
const labels = (content: DomNode) => content.byClass("shelf-book-open").map((el) => el.attrs["aria-label"]);

afterEach(() => __captureSettings(null));

describe("articles saved with Web Clipper, on the shelf (#744)", () => {
    it("shelves the clippings of the articles folder as articles, with their count, byline and drawn cover (FR-3)", async () => {
        const { view, content } = mount();
        await view.onOpen();
        expect(chips(content).map((el) => el.textContent)).toEqual(["All3", "Books1", "Papers0", "Articles2", "Paths0"]);
        chips(content)[3].click();
        // Never opened: both stand On the shelf, said once each, with their byline.
        expect(content.byClass("shelf-bay").map((el) => el.attrs["data-zf-shelf"])).toEqual(["none"]);
        expect(labels(content).sort()).toEqual(["Open Old essay, blog.example.org, Not started", "Open The case for slow software, Jane Doe, Not started"]);
        expect(content.byClass("shelf-cover--article")).toHaveLength(2);
        // Where they come from, under the chip.
        expect(content.oneByClass("shelf-articles-from").textContent).toBe("Articles come from Clippings·Change");
    });

    it("says where articles come from when there are none, and changes the folder there — the same setting as Settings → Reading (AC-7)", async () => {
        const settings: Setting[] = [];
        __captureSettings((setting) => settings.push(setting));
        const { view, content, host } = mount({ articlesFolder: "Web" });
        await view.onOpen();
        expect(chips(content)[3].textContent).toBe("Articles0");
        chips(content)[3].click();
        expect(content.byClass("shelf-no-match")).toHaveLength(0);
        expect(content.oneByClass("shelf-articles-from").textContent).toBe("Articles come from Web·Change");
        content.oneByClass("shelf-articles-change").click();
        const field = settings[settings.length - 1] as any;
        expect(field.name).toBe("Articles folder");
        expect(field.searches[0].value).toBe("Web");
        field.searches[0].type("Clippings");
        field.searches[0].inputEl.fire("keydown", { key: "Enter" });
        await flush();
        expect(host.settings.articlesFolder).toBe("Clippings");
        expect(host.saveSettings).toHaveBeenCalledTimes(1);
        expect(chips(content)[3].textContent).toBe("Articles2");
        expect(content.oneByClass("shelf-articles-from").textContent).toBe("Articles come from Clippings·Change");
        // Settings → Reading reads the very same value.
        const plugin = { settings: { ...structuredClone(DEFAULT_SETTINGS), ...host.settings }, saveSettings: jest.fn(async () => undefined) };
        const row = (readingSettingsGroup(plugin as never) as any).items.find((item: any) => item.name === "Articles folder");
        const drawn = new Setting(new DomNode()) as any;
        row.render(drawn);
        expect(drawn.searches[0].value).toBe("Clippings");
    });

    it("refuses the archive's folder there too (#865 FR-4, AC-9)", async () => {
        const settings: Setting[] = [];
        __captureSettings((setting) => settings.push(setting));
        const { view, content, host } = mount({ articlesFolder: "Web", libraryArchiveFolder: "Put away" });
        await view.onOpen();
        chips(content)[3].click();
        content.oneByClass("shelf-articles-change").click();
        const field = settings[settings.length - 1] as any;
        field.searches[0].type("Put away/clips");
        field.searches[0].inputEl.fire("keydown", { key: "Enter" });
        await flush();
        expect(host.settings.articlesFolder).toBe("Web");
        expect(host.saveSettings).not.toHaveBeenCalled();
    });

    it("turns articles off when the folder is emptied", async () => {
        const { view, content } = mount({ articlesFolder: "" });
        await view.onOpen();
        expect(chips(content)[3].textContent).toBe("Articles0");
        chips(content)[3].click();
        expect(content.oneByClass("shelf-articles-from").textContent).toBe("Articles are off·Change");
    });

    it("opens an article in the Reader with the shot from its drawn cover, and the way back to its card (FR-5, FR-12)", async () => {
        const { view, content } = mount();
        await view.onOpen();
        chips(content)[3].click();
        book(content, SLOW).oneByClass("shelf-book-open").click();
        const cover = beginOpenShot.mock.calls[0][1] as DomNode;
        expect(cover.getAttribute("data-zf-book")).toBe(SLOW);
        expect(cover.hasClass("zettelkasten-flow__shelf-cover--article")).toBe(true);
        // The Reader opens once the camera's first frame is shown (#826).
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(openReader.mock.calls[0][1]).toMatchObject({ seed: SLOW, source: SLOW, back: { filter: "articles", focus: SLOW } });
    });

    it("sets an article's status in its own frontmatter, never making a book's note (FR-4, AC-5)", async () => {
        const { view, content, writes } = mount();
        await view.onOpen();
        await view.setState({ detail: SLOW }, {} as never);
        // No fields to type: the article's fields are its own.
        expect(content.byClass("shelf-details-input")).toHaveLength(0);
        expect(content.oneByClass("shelf-details-where").textContent).toContain(SLOW);
        const select = content.oneByClass("shelf-details-status");
        select.value = "finished";
        select.fire("change");
        await flush();
        expect(writes.editArticle).toHaveBeenCalledTimes(1);
        expect((writes.editArticle.mock.calls[0] as unknown[])[1]).toEqual({ status: "finished" });
        for (const spy of [writes.create, writes.edit, writes.adopt]) expect(spy).not.toHaveBeenCalled();
        expect(content.byClass("shelf-details-undo")).toHaveLength(1);
    });
});

describe("a book that arrives (#744 FR-9, FR-13, #820)", () => {
    it("stands a new book on the shelf of its status, with the added order in the bar", async () => {
        const reading = { [BOOK]: { size: 10, mtime: 20, title: "Thinking, Fast and Slow", chapters: 38, chapter: 2, at: Date.now() - DAY } };
        const { view, content } = mount({ library: reading }, [NEW_BOOK]);
        await view.onOpen();
        // The book you are in lies on the desk; the rest stand On the shelf. No *Recently added* row repeats them.
        expect(content.byClass("shelf-desk-card").map((el) => el.attrs["data-shelf-id"])).toEqual([BOOK]);
        expect(content.byClass("shelf-bay").map((el) => el.attrs["data-zf-shelf"])).toEqual(["none"]);
        expect(content.byClass("shelf-book").map((el) => el.attrs["data-shelf-id"])).not.toContain(BOOK);
        expect(content.oneByClass("shelf-sort").findAll((el) => el.tag === "option").map((el) => el.textContent)).toEqual([
            "Recently read",
            "Most highlighted",
            "Title",
            "Recently added",
        ]);
    });

    it("lets a book that arrives while the shelf is open settle in — and moves nothing at the first draw", async () => {
        const restore = reducedMotion(false);
        const record = recordAnimations();
        // A layout: every book a slot after the one before it, in the order the shelf draws them.
        const proto = DomNode.prototype as any;
        const rect = proto.getBoundingClientRect;
        proto.getBoundingClientRect = function (this: DomNode) {
            let root: DomNode = this;
            while (root.parent) root = root.parent;
            const books = root.findAll((el) => el.attrs["data-shelf-id"] !== undefined);
            return { left: books.indexOf(this) * 100, top: 0, width: 100, height: 90 };
        };
        try {
            const m = mount();
            await m.view.onOpen();
            expect(record.animations).toHaveLength(0);
            // A book dropped into the vault.
            m.sources.push(file(NEW_BOOK, Date.now()));
            m.view.refresh();
            const arrived = book(m.content, NEW_BOOK);
            const settle = record.animations.filter((a) => a.target === arrived);
            expect(settle).toHaveLength(1);
            expect(settle[0].keyframes).toEqual([
                { opacity: 0, transform: "scale(0.96)" },
                { opacity: 1, transform: "scale(1)" },
            ]);
            expect(settle[0].options.duration).toBe(250);
            // Only transform and opacity move.
            expect([...record.keys()].every((key) => key === "transform" || key === "opacity")).toBe(true);
            // Drawn again with nothing new: nothing arrives.
            const settling = () => record.animations.filter((a) => a.keyframes[0].transform === "scale(0.96)").length;
            const before = settling();
            m.view.refresh();
            expect(settling()).toBe(before);
        } finally {
            proto.getBoundingClientRect = rect;
            record.stop();
            restore();
        }
    });

    it("simply shows it under reduced motion", async () => {
        const restore = reducedMotion(true);
        const record = recordAnimations();
        try {
            const m = mount();
            await m.view.onOpen();
            m.sources.push(file(NEW_BOOK, Date.now()));
            m.view.refresh();
            expect(book(m.content, NEW_BOOK)).toBeDefined();
            expect(record.animations).toHaveLength(0);
        } finally {
            record.stop();
            restore();
        }
    });
});

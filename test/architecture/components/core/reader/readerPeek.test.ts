import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { press } from "../../../../support/readerKeys";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

/**
 * A three-chapter reading (a → b → c, picked as a selection) whose first chapter links to a chapter
 * of the path (b), to a note outside it (x), and to a note that does not exist (missing).
 */
function mount() {
    const files: Record<string, string> = {
        "a.md": "A links to [[b]] and to [[x]] and to [[missing]].",
        "b.md": "The body of B.",
        "c.md": "The body of C.",
        "x.md": "---\nstate: fleeting\n---\n# X\n\nX is the outside note, read as a **detour**.",
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
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
    const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) });
    return { view, app, content, leaf };
}

async function open() {
    const m = mount();
    await m.view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md", "c.md"] }, {} as never);
    await m.view.onOpen();
    await flush();
    return m;
}

const link = (content: DomNode, href: string) =>
    content.findAll((el) => el.tag === "a" && el.getAttribute("data-href") === href)[0];
/** A click on a link, as it reaches the chapter body's handler: bubbled, with the link as its target. */
const clickLink = (content: DomNode, href: string, extra: Record<string, unknown> = {}) =>
    content.oneByClass("reader-body").fire("click", { target: link(content, href), ...extra });
const title = (content: DomNode) => content.oneByClass("reader-chapter-title").textContent;
const button = (content: DomNode, text: string) => content.byClass("reader-peek-action").find((b) => b.textContent === text);
const key = (content: DomNode, k: string, extra: Record<string, unknown> = {}) =>
    press(content as never, k, { target: content, ...extra });

describe("a link is a peek, not a jump (#670)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
    });

    it("opens a peek inline under the paragraph, with where the note sits and its first words", async () => {
        const { content } = await open();
        clickLink(content, "x");
        await flush();
        const peek = content.oneByClass("reader-peek");
        // Inline: the card follows the paragraph that holds the link, inside the chapter's body.
        const paragraph = link(content, "x").closest("p")!;
        expect(paragraph.parentElement!.children[paragraph.parentElement!.children.indexOf(paragraph) + 1]).toBe(peek);
        expect(content.oneByClass("reader-peek-place").textContent).toBe("Not in this reading");
        expect(content.oneByClass("reader-peek-title").textContent).toBe("x");
        expect(content.oneByClass("reader-peek-excerpt").textContent).toBe("X is the outside note, read as a detour.");
        expect(content.byClass("reader-peek-action").map((b) => b.textContent)).toEqual([
            "Read as a detour",
            "Add to this reading",
            "Open in a new tab",
            "Close",
        ]);
        expect(title(content)).toBe("a"); // the page did not turn
    });

    it("offers to jump when the note is a chapter of this reading", async () => {
        const { content } = await open();
        clickLink(content, "b");
        await flush();
        expect(content.oneByClass("reader-peek-place").textContent).toBe("Chapter 2 of this reading");
        button(content, "Jump to the chapter")!.click();
        await flush();
        expect(title(content)).toBe("b");
        expect(content.byClass("reader-peek")).toEqual([]);
    });

    it("only says so for a note that does not exist — following it would create it", async () => {
        const { content, app } = await open();
        clickLink(content, "missing");
        await flush();
        expect(content.oneByClass("reader-peek-place").textContent).toBe("This note does not exist yet.");
        expect(content.byClass("reader-peek-action").map((b) => b.textContent)).toEqual(["Close"]);
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("opens a new tab on Mod-click, for a note that exists", async () => {
        const { content, app } = await open();
        clickLink(content, "x", { ctrlKey: true });
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("x.md", "a.md", "tab");
        expect(content.byClass("reader-peek")).toEqual([]);
    });

    it("closes with Esc, before anything else does", async () => {
        const { content, leaf } = await open();
        clickLink(content, "x");
        key(content, "Escape");
        expect(content.byClass("reader-peek")).toEqual([]);
        expect(leaf.detach).not.toHaveBeenCalled();
    });
});

describe("detours, with a way back (#670)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("reads a detour, says so, and comes back to the chapter it left", async () => {
        const { content } = await open();
        clickLink(content, "x");
        button(content, "Read as a detour")!.click();
        await flush();
        expect(title(content)).toBe("x");
        expect(content.oneByClass("reader-count").textContent).toBe("Detour");
        const pill = content.oneByClass("reader-detour-pill");
        expect(pill.hasClass("zettelkasten-flow__reader-hidden")).toBe(false);
        expect(pill.textContent).toBe("↩ Back to a");
        // Progress stays on the path: still chapter 1 of 3.
        expect(content.oneByClass("reader-bar-label").textContent).toBe("Chapter 1 / 3");
        expect(content.oneByClass("reader-next-button").textContent).toBe("Back to a");

        pill.click();
        await flush();
        expect(title(content)).toBe("a");
        expect(content.oneByClass("reader-detour-pill").hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
    });

    it("steps back one level with Esc, and leaves the reader only once nothing is open", async () => {
        const { content, leaf } = await open();
        clickLink(content, "x");
        button(content, "Read as a detour")!.click();
        await flush();
        key(content, "Escape");
        await flush();
        expect(title(content)).toBe("a");
        expect(leaf.detach).not.toHaveBeenCalled();
        key(content, "Escape");
        expect(leaf.detach).toHaveBeenCalled();
    });

    it("moving along the path leaves the detour", async () => {
        const { content } = await open();
        clickLink(content, "x");
        button(content, "Read as a detour")!.click();
        await flush();
        key(content, "ArrowRight");
        await flush();
        expect(title(content)).toBe("b");
        expect(content.oneByClass("reader-count").textContent).toBe("02 / 03");
    });
});

describe("adding to this reading, and the contents (#670)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("adds a note right after this chapter, for this reading only", async () => {
        const { content, view } = await open();
        clickLink(content, "x");
        button(content, "Add to this reading")!.click();
        await flush();
        expect(content.byClass("reader-dot")).toHaveLength(4);
        expect(content.oneByClass("reader-next-label").textContent).toBe("Next · x");
        // Session only: the view state still names the picked set.
        expect(view.getState()).toMatchObject({ paths: ["a.md", "b.md", "c.md"] });
    });

    it("ticks the chapters you have read and marks where you are", async () => {
        const { content } = await open();
        key(content, "ArrowRight");
        await flush();
        content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Contents")!.click();
        const rows = content.byClass("reader-toc-row");
        expect(rows.map((r) => r.byClass("reader-toc-tick").length)).toEqual([1, 0, 0]);
        expect(rows[1].getAttribute("aria-current")).toBe("step");
    });

    it("writes nothing while you peek, detour and add", async () => {
        const { content, app } = await open();
        clickLink(content, "x");
        button(content, "Add to this reading")!.click();
        await flush(); // the chapter redraws with the reading one longer
        clickLink(content, "x");
        button(content, "Read as a detour")!.click();
        await flush();
        expect(app.vault.modify).not.toHaveBeenCalled();
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(app.vault.create).not.toHaveBeenCalled();
    });
});

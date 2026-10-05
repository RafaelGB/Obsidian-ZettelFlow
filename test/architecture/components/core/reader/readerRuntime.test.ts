import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { KnowledgeIndex } from "architecture/knowledge";

/**
 * The Reader in the real app (#667 runtime audit): what the jest fakes used to let through — a link
 * caught before Obsidian's own handlers, fullscreen on the window, a restored place kept until the
 * index can say what it is, Obsidian's hotkeys left alone, and the keys taken when the leaf is focused.
 */
function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

function mount() {
    const files: Record<string, string> = {
        "a.md": "A links to [[b]] and to [[x]].",
        "b.md": "The body of B.",
        "c.md": "The body of C.",
        "x.md": "X is the outside note.",
    };
    const handlers: Record<string, () => void> = {};
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
            modify: jest.fn(),
            process: jest.fn(),
        },
        metadataCache: {
            getFirstLinkpathDest: (link: string) => (files[`${link}.md`] !== undefined ? file(`${link}.md`) : null),
            on: (name: string, fn: () => void) => ((handlers[name] = fn), {}),
        },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) });
    return { view, app, content, handlers };
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
const body = (content: DomNode) => content.oneByClass("reader-body");
const key = (content: DomNode, k: string, extra: Record<string, unknown> = {}) =>
    content.fire("keydown", { key: k, target: content, ...extra });

describe("the reader in the real app (#667)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
    });
    afterEach(() => jest.restoreAllMocks());

    it("catches link clicks in the capture phase, before the chapter is rendered", async () => {
        const seen: unknown[][] = [];
        const render = MarkdownRenderer.render.bind(MarkdownRenderer);
        jest.spyOn(MarkdownRenderer, "render").mockImplementation(async (app, md, el, path, component) => {
            const node = el as unknown as DomNode;
            seen.push([...(node.listenerOptions.click ?? []), ...(node.listenerOptions.auxclick ?? [])]);
            await render(app, md, el, path, component);
        });
        await open();
        // An embed's own link handler sits inside the body: only a capturing listener gets there first.
        expect(seen[0]).toEqual([{ capture: true }, { capture: true }]);
    });

    it("stops a link's click from reaching Obsidian's handlers, and opens the peek instead", async () => {
        const { content, app } = await open();
        const evt = body(content).fire("click", { target: link(content, "x") });
        expect(evt.defaultPrevented).toBe(true);
        expect(evt.propagationStopped).toBe(true);
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
        expect(content.byClass("reader-peek").length).toBe(1);
    });

    it("lets a tag link do nothing, rather than change the page's address", async () => {
        const { content } = await open();
        const tag = body(content).createEl("a", { cls: "tag", text: "#idea", attr: { href: "#idea" } });
        const evt = body(content).fire("click", { target: tag });
        expect(evt.defaultPrevented).toBe(true);
        expect(evt.propagationStopped).toBe(true);
    });

    it("fullscreens the whole window, and leaves Ctrl+F to Obsidian", async () => {
        const { content } = await open();
        const requestFullscreen = jest.fn(() => Promise.reject(new Error("denied")));
        (content as unknown as { doc: unknown }).doc = { fullscreenElement: null, body: { requestFullscreen } };
        key(content, "f", { ctrlKey: true });
        key(content, "f", { metaKey: true });
        expect(requestFullscreen).not.toHaveBeenCalled();
        key(content, "f");
        // The document's body, so modals, menus and notices stay on screen; a refusal is caught.
        expect(requestFullscreen).toHaveBeenCalledTimes(1);
        await flush();
    });

    it("leaves Alt+← and Ctrl+→ to the app", async () => {
        const { content } = await open();
        key(content, "ArrowRight", { ctrlKey: true });
        key(content, "ArrowRight", { altKey: true });
        await flush();
        expect(content.oneByClass("reader-count").textContent).toBe("01 / 03");
    });

    it("drops the detour and the peek when another reading is opened in the same leaf", async () => {
        const { view, content } = await open();
        body(content).fire("click", { target: link(content, "x") });
        content.byClass("reader-peek-action").find((b) => b.textContent === "Read as a detour")!.click();
        await flush();
        expect(content.oneByClass("reader-count").textContent).toBe("Detour");

        await view.setState({ seed: "b.md", kind: "selection", paths: ["b.md", "c.md"] }, {} as never);
        await flush();
        expect(content.oneByClass("reader-chapter-title").textContent).toBe("b");
        expect(content.oneByClass("reader-detour-pill").hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
        expect(content.byClass("reader-peek").length).toBe(0);
    });

    it("keeps a restored place until the index is ready, then reads it", async () => {
        const index = KnowledgeIndex.getInstance();
        const status = jest.spyOn(index, "status", "get").mockReturnValue("building" as never);
        const { view, handlers } = mount();
        await view.setState({ seed: "a.md", chapter: 4 }, {} as never);
        await view.onOpen();
        await flush();
        // Saved as chapter 4 — not overwritten with 0 while the model is still being built.
        expect(view.getState()).toMatchObject({ seed: "a.md", chapter: 4 });

        status.mockReturnValue("ready" as never);
        handlers.resolved?.();
        await flush();
        // Now the path is known, and the place is clamped to it.
        const state = view.getState() as { chapter: number };
        expect(state.chapter).toBeLessThan(4);
    });

    it("takes the keys when Obsidian focuses the leaf", async () => {
        const { view, content } = await open();
        const focus = jest.spyOn(content, "focus");
        view.setEphemeralState({ focus: true });
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        focus.mockClear();
        view.setEphemeralState({});
        expect(focus).not.toHaveBeenCalled();
    });
});

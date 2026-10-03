import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { queueCompanionWrite, resetCompanionWrites } from "architecture/components/core/noteCompanion/companionWrites";
import { NoteCompanionView } from "architecture/components/core/noteCompanion/NoteCompanionView";
import { HeadBlock } from "architecture/components/core/noteCompanion/blocks/headBlock";

const SOURCE = readFileSync(
    join(__dirname, "../../../../../src/architecture/components/core/noteCompanion/NoteCompanionView.ts"),
    "utf8"
);

function markdown(path: string): TFile {
    const file = new TFile();
    file.path = path;
    file.extension = "md";
    return file;
}

function mount(active: TFile | null = markdown("zettel/A.md")) {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const on = (name: string, fn: (...args: unknown[]) => void) => {
        (listeners[name] ??= []).push(fn);
        return { name };
    };
    const app = {
        workspace: {
            on,
            getActiveFile: () => active,
            openLinkText: jest.fn(),
            requestSaveLayout: jest.fn(),
            trigger: jest.fn(),
            onLayoutReady: jest.fn(),
        },
        metadataCache: { on, getFileCache: () => null },
        vault: { on, getAbstractFileByPath: () => null, getMarkdownFiles: () => [] },
    };
    const content = new DomNode();
    const view = new NoteCompanionView(new WorkspaceLeaf(app, content) as never);
    return { view, app, content, fire: (name: string, ...args: unknown[]) => listeners[name]?.forEach((fn) => fn(...args)) };
}

describe("the This note view (#640 FR-1..6, FR-19)", () => {
    it("returns its type as a literal, safe to call from the ItemView constructor (#278)", () => {
        expect(SOURCE).toMatch(/getViewType\(\)\s*:\s*string\s*\{\s*return\s*"zettelflow-note"/);
        expect(mount().view.getViewType()).toBe("zettelflow-note");
    });

    it("is called This note", () => {
        expect(mount().view.getDisplayText()).toBe("This note");
    });

    it("lays the blocks out in a head and two body columns", async () => {
        const { view, content } = mount();
        await view.onOpen();
        for (const column of ["note-companion-col-head", "note-companion-col-main", "note-companion-col-side"]) {
            expect(content.byClass(column)).toHaveLength(1);
        }
    });

    it("starts on the active note", async () => {
        const { view, content } = mount();
        await view.onOpen();
        expect(content.oneByClass("note-companion-title").textContent).toBe("A");
    });

    it("follows the next note you open, and shows the empty state for a canvas", async () => {
        const { view, content, fire } = mount();
        await view.onOpen();
        fire("file-open", markdown("zettel/B.md"));
        expect(content.oneByClass("note-companion-title").textContent).toBe("B");
        const canvas = new TFile();
        canvas.path = "flow.canvas";
        canvas.extension = "canvas";
        fire("file-open", canvas);
        expect(content.oneByClass("note-companion-last").textContent).toBe("B");
    });

    it("keeps a pin, and the pin survives a restart through the view state", async () => {
        const { view } = mount();
        await view.setState({ path: "zettel/A.md", pinned: true }, {} as never);
        expect(view.getState()).toEqual({ path: "zettel/A.md", pinned: true });
    });

    it("persists nothing for a followed note — next time it follows whatever is active", async () => {
        const { view } = mount();
        await view.onOpen();
        expect(view.getState()).toEqual({});
    });

    it("stays on a pinned note while others are opened, and saves the layout when pinned", async () => {
        const { view, content, fire, app } = mount();
        await view.onOpen();
        content.oneByClass("note-companion-pin").click();
        expect(app.workspace.requestSaveLayout).toHaveBeenCalled();
        fire("file-open", markdown("zettel/B.md"));
        expect(content.oneByClass("note-companion-title").textContent).toBe("A");
    });

    it("accepts a hand-over it cannot place yet without an error, and never persists it", async () => {
        const { view } = mount();
        await view.onOpen();
        await expect(view.setState({ focus: "next", move: "connect" }, {} as never)).resolves.toBeUndefined();
        expect(view.getState()).toEqual({});
    });

    it("cleans up after itself", async () => {
        const { view, content } = mount();
        await view.onOpen();
        await view.onClose();
        expect(content.children).toEqual([]);
    });

    it("reads in order: head, next step, neighbourhood, sections, story (#641, #643, #642)", async () => {
        const { view, content } = mount();
        await view.onOpen();
        const blocks = (view as unknown as { blocks: { id: string }[] }).blocks.map((block) => block.id);
        expect(blocks).toEqual(["head", "next", "neighbourhood", "sections", "story"]);
        expect(content.byClass("note-companion-col-main")).toHaveLength(1);
    });

    it("hands a next-step focus and its move to the block that owns it", async () => {
        const { view } = mount();
        await view.onOpen();
        const next = (view as unknown as { blocks: { id: string; reveal: (...args: unknown[]) => void }[] }).blocks.find(
            (block) => block.id === "next"
        )!;
        const reveal = jest.spyOn(next, "reveal");
        await view.setState({ focus: "next", move: "connect" }, {} as never);
        expect(reveal).toHaveBeenCalledWith("next", "connect");
        expect(reveal).toHaveBeenCalledTimes(1);
    });

    it("builds the ⋯ menu from every block's items, in block order (#642)", async () => {
        const { view } = mount();
        await view.onOpen();
        const blocks = (view as unknown as { blocks: { id: string; menuItems: () => unknown[] }[] }).blocks;
        const head = blocks.find((block) => block.id === "head")!;
        const story = blocks.find((block) => block.id === "story")!;
        jest.spyOn(head, "menuItems").mockReturnValue([{ label: "head" }]);
        jest.spyOn(story, "menuItems").mockReturnValue([{ label: "story" }]);
        const items = (view as unknown as { menuItems: () => { label: string }[] }).menuItems();
        expect(items.map((item) => item.label)).toEqual(["head", "story"]);
    });

    it("remembers graph or list in the settings it is handed (#643 FR-11)", async () => {
        const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const on = (name: string, fn: (...args: unknown[]) => void) => {
            (listeners[name] ??= []).push(fn);
            return { name };
        };
        const app = {
            workspace: { on, getActiveFile: () => null, openLinkText: jest.fn(), requestSaveLayout: jest.fn(), trigger: jest.fn(), onLayoutReady: jest.fn() },
            metadataCache: { on, getFileCache: () => null },
            vault: { on, getAbstractFileByPath: () => null, getMarkdownFiles: () => [] },
        };
        const plugin = { settings: { noteNeighbourhoodView: "list" as "graph" | "list" }, saveSettings: jest.fn(async () => undefined) };
        const view = new NoteCompanionView(new WorkspaceLeaf(app, new DomNode()) as never, plugin);
        await view.onOpen();
        const set = (view as unknown as { setNeighbourhoodView: (v: "graph" | "list") => void }).setNeighbourhoodView.bind(view);
        set("graph");
        expect(plugin.settings.noteNeighbourhoodView).toBe("graph");
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        set("graph");
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
});

describe("a render that would draw the same thing is skipped (#639 review)", () => {
    it("keeps the DOM you are looking at when nothing it reads has moved", async () => {
        const { view, content } = mount();
        await view.onOpen();
        const before = content.oneByClass("note-companion-title");
        (view as unknown as { render(): void }).render();
        expect(content.oneByClass("note-companion-title")).toBe(before);
    });

    it("redraws on the refresh button even so", async () => {
        const { view, content } = mount();
        await view.onOpen();
        const before = content.oneByClass("note-companion-title");
        content.oneByClass("note-companion-refresh").click();
        expect(content.oneByClass("note-companion-title")).not.toBe(before);
    });

    it("redraws when you open another note", async () => {
        const { view, content, fire } = mount();
        await view.onOpen();
        const before = content.oneByClass("note-companion-title");
        fire("file-open", markdown("zettel/B.md"));
        expect(content.oneByClass("note-companion-title")).not.toBe(before);
    });
});

describe("one block failing does not take the others down (#639 walk)", () => {
    it("says so in the failing block's own place and still draws the rest", async () => {
        // In the vault a graph threw while drawing and the story below it never rendered: blocks
        // were updated in one chain. Each one is on its own now.
        const spy = jest.spyOn(HeadBlock.prototype, "update").mockImplementation(() => {
            throw new Error("boom");
        });
        const { view, content } = mount();
        await view.onOpen();
        const head = content.oneByClass("note-companion-col-head");
        expect(head.textContent).toBe("This part could not be drawn. Try refresh.");
        // The main column still rendered its blocks.
        expect(content.oneByClass("note-companion-col-main").children.length).toBeGreaterThan(0);
        spy.mockRestore();
    });
});

describe("in the real app (#639 runtime audit)", () => {
    it("scrolls its own container to put a target just under the sticky head, never scrollIntoView", async () => {
        const { view, content } = mount();
        await view.onOpen();
        const head = content.oneByClass("note-companion-col-head");
        head.offsetHeight = 120;
        content.scrollTop = 300;
        const target = new DomNode();
        target.getBoundingClientRect = () => ({ left: 0, top: 500, width: 100, height: 20 });
        (view as unknown as { scrollTo(el: unknown): void }).scrollTo(target);
        // 500 below the container's top + 300 already scrolled − 120 of head − 8 of air.
        expect(content.scrolls).toEqual([{ top: 672, behavior: "smooth" }]);
        expect(target.scrolls).toEqual([]);
    });

    it("jumps instead of gliding when motion is reduced", async () => {
        (globalThis as { activeWindow?: unknown }).activeWindow = { matchMedia: () => ({ matches: true }) };
        try {
            const { view, content } = mount();
            await view.onOpen();
            (view as unknown as { scrollTo(el: unknown): void }).scrollTo(new DomNode());
            expect(content.scrolls[0].behavior).toBe("auto");
        } finally {
            delete (globalThis as { activeWindow?: unknown }).activeWindow;
        }
    });

    it("draws what it owes when it is first shown (Obsidian calls onResize then)", async () => {
        const { view, content } = mount();
        let shown = false;
        content.isShown = () => shown;
        await view.onOpen();
        expect(content.byClass("note-companion-title")).toEqual([]);
        shown = true;
        view.onResize();
        expect(content.oneByClass("note-companion-title").textContent).toBe("A");
    });

    it("says it is busy while a companion write is in flight", async () => {
        const { view, content } = mount();
        await view.onOpen();
        let release: () => void = () => undefined;
        const write = queueCompanionWrite(() => new Promise<void>((resolve) => (release = resolve)));
        expect(content.oneByClass("note-companion").getAttribute("aria-busy")).toBe("true");
        await flush();
        release();
        await write;
        expect(content.oneByClass("note-companion").getAttribute("aria-busy")).toBe("false");
        resetCompanionWrites();
    });
});

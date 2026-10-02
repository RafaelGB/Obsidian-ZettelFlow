import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { NoteCompanionView } from "architecture/components/core/noteCompanion/NoteCompanionView";

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

    it("reads in order: head, next step, sections, history (#641)", async () => {
        const { view, content } = mount();
        await view.onOpen();
        const blocks = (view as unknown as { blocks: { id: string }[] }).blocks.map((block) => block.id);
        expect(blocks).toEqual(["head", "next", "sections", "history"]);
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
});

import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { TFile } from "obsidian";
import { DomNode } from "../../../support/dashboardDom";
import CanvasHelper from "architecture/plugin/canvas/extensions/utils/CanvasHelper";
import EditStepCanvasExtension from "architecture/plugin/canvas/extensions/EditCanvasExtension";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";

// The step editor's import chain reaches the canvas patcher and its ESM-only JSONC parser.
jest.mock("tiny-jsonc", () => ({ __esModule: true, default: { parse: JSON.parse } }));

/**
 * **A file node selected first got no ZettelFlow option** (#686).
 *
 * In Obsidian 1.14 the canvas frame focuses a newly selected node *before* it renders the selection
 * menu, and focusing a file node sets `workspace.activeEditor` to the note it embeds. From that
 * moment `workspace.getActiveFile()` is the note, not the canvas — so every "is this canvas a flow?"
 * check that asked the workspace said no, and the popup stayed plain. The canvas knows its own file
 * (`canvas.view.file`); that is what is asked now.
 */

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    f.basename = f.name.replace(/\.[^.]+$/, "");
    return f;
}

const CANVAS = file("Flows/Zettelkasten.canvas");
const NOTE = file("Steps/Permanent.md");

/** The workspace as Obsidian leaves it after focusing a file node: the active file is the note. */
function pluginFocusedOnTheNote() {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const plugin = {
        settings: { ribbonCanvas: "Flows/Zettelkasten.canvas" },
        app: {
            workspace: {
                getActiveFile: () => NOTE,
                getMostRecentLeaf: () => null,
                on: (name: string, fn: (...args: unknown[]) => void) => {
                    (listeners[name] ??= []).push(fn);
                    return { name };
                },
            },
            vault: { getAbstractFileByPath: (path: string) => (path === NOTE.path ? NOTE : null) },
        },
        registerEvent: () => undefined,
    };
    return { plugin, fire: (name: string, ...args: unknown[]) => listeners[name]?.forEach((fn) => fn(...args)) };
}

function canvasWithFileNodeSelected() {
    const menuEl = new DomNode("div");
    menuEl.createEl("button", { cls: "clickable-icon" }); // Obsidian's own "remove"
    menuEl.createEl("button", { cls: "clickable-icon" }); // and "colour"
    const node = { id: "n1", file: NOTE, getData: () => ({ id: "n1", type: "file", file: NOTE.path }) };
    return {
        menuEl,
        canvas: {
            view: { file: CANVAS },
            isDragging: false,
            menu: { menuEl },
            selection: new Set([node]),
            edges: new Map(),
        },
    };
}

beforeAll(() => {
    (globalThis as { createEl?: unknown }).createEl = (tag: string, options?: unknown) => {
        const el = new DomNode().createEl(tag, options);
        el.parent = null;
        return el;
    };
});

afterEach(() => jest.restoreAllMocks());

describe("the canvas is asked about itself, not the workspace (#686)", () => {
    it("resolves the canvas file even when the active file is the note a file node embeds", () => {
        const { plugin } = pluginFocusedOnTheNote();
        const { canvas } = canvasWithFileNodeSelected();
        expect(CanvasHelper.canvasFile(plugin as never, canvas as never)?.path).toBe(CANVAS.path);
    });

    it("so the canvas still reads as a flow", () => {
        const { plugin } = pluginFocusedOnTheNote();
        const { canvas } = canvasWithFileNodeSelected();
        expect(CanvasHelper.isCanvasFlow(plugin as never, canvas as never)).toBe(true);
    });

    it("never mistakes a markdown note for the canvas when it has no canvas to ask", () => {
        const { plugin } = pluginFocusedOnTheNote();
        expect(CanvasHelper.canvasFile(plugin as never, null)).toBeNull();
    });

    it("offers Edit step on a file node selected first, when its note is a step", () => {
        jest.spyOn(FrontmatterService, "instance").mockReturnValue({
            hasZettelFlowSettings: () => true,
            getZettelFlowSettings: () => ({}),
        } as never);
        const { plugin, fire } = pluginFocusedOnTheNote();
        new EditStepCanvasExtension(plugin as never).init();

        const { canvas, menuEl } = canvasWithFileNodeSelected();
        fire("canvas:popup-menu", canvas);

        const edit = menuEl.querySelector("#edit-zettelflow-step-btn");
        expect(edit).not.toBeNull();
        expect(edit?.getAttribute("aria-label")).toBe("Edit step");
        expect(edit?.textContent).toBe("Edit step");
    });

    it("offers nothing on a file node whose note is not a step", () => {
        jest.spyOn(FrontmatterService, "instance").mockReturnValue({
            hasZettelFlowSettings: () => false,
        } as never);
        const { plugin, fire } = pluginFocusedOnTheNote();
        new EditStepCanvasExtension(plugin as never).init();

        const { canvas, menuEl } = canvasWithFileNodeSelected();
        fire("canvas:popup-menu", canvas);

        expect(menuEl.querySelector("#edit-zettelflow-step-btn")).toBeNull();
        expect(menuEl.children).toHaveLength(2);
    });
});

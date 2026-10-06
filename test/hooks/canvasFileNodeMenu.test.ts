import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Menu, TFile } from "obsidian";

const opened: { info: Record<string, unknown>; mode?: string; builder?: string }[] = [];
jest.mock("zettelkasten", () => ({
    StepBuilderMapper: { StepSettings2PartialStepBuilderInfo: (settings: Record<string, unknown>) => ({ ...settings, mapped: true }) },
    StepBuilderModal: class {
        entry: { info: Record<string, unknown>; mode?: string; builder?: string };
        constructor(_plugin: unknown, info: Record<string, unknown>) {
            this.entry = { info };
        }
        setMode(mode: string) { this.entry.mode = mode; return this; }
        setBuilder(builder: string) { this.entry.builder = builder; return this; }
        setNodeId() { return this; }
        open() { opened.push(this.entry); }
    },
}));
const clipboard: { value: unknown; save: jest.Mock } = { value: null, save: jest.fn() };
jest.mock("architecture/plugin/canvas", () => ({ canvas: { clipboard: { get: () => clipboard.value, save: (v: unknown) => clipboard.save(v) }, flows: {} } }));
const frontmatter: Record<string, Record<string, unknown> | null> = {};
const writes: { path: string; op: string; value?: unknown }[] = [];
jest.mock("architecture/plugin", () => ({
    YamlService: { instance: () => ({ getZettelFlowSettings: () => ({}) }) },
    FrontmatterService: {
        instance: (note: { path: string }) => ({
            hasZettelFlowSettings: () => Boolean(frontmatter[note.path]),
            getZettelFlowSettings: () => frontmatter[note.path],
            removeStepSettings: async () => void writes.push({ path: note.path, op: "remove" }),
            setZettelFlowSettings: async (value: unknown) => void writes.push({ path: note.path, op: "set", value }),
        }),
    },
}));
jest.mock("architecture/plugin/workflow", () => ({ isWaitNode: () => false }));
jest.mock("starters/zcomponents/RibbonIcon", () => ({ RibbonIcon: { ACTION: "zf", ID: "zf" } }));
const canvasFile = { current: null as TFile | null };
jest.mock("architecture/plugin/canvas/extensions/utils/CanvasHelper", () => ({ __esModule: true, default: { canvasFile: () => canvasFile.current } }));
jest.mock("main", () => ({}));

import { CanvasNodeMenu } from "hooks/CanvasNodeMenu";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    f.basename = f.name.replace(/\.[^.]+$/, "");
    return f;
}

const FLOW = file("Flows/Zettelkasten.canvas");
const PLAIN = file("Flows/Sketch.canvas");
const NOTE = file("Steps/Permanent.md");
const PDF = file("Papers/cap.pdf");

function setup() {
    let handler: ((menu: Menu, node: unknown) => void) | null = null;
    const plugin = {
        settings: { ribbonCanvas: FLOW.path },
        app: {
            workspace: { on: (_name: string, fn: (menu: Menu, node: unknown) => void) => ((handler = fn), { name: _name }) },
            vault: { getAbstractFileByPath: (path: string) => [NOTE, PDF].find((f) => f.path === path) ?? null },
        },
        registerEvent: () => undefined,
    };
    CanvasNodeMenu.setup(plugin as never);
    return (target: TFile) => {
        const menu = new Menu();
        handler?.(menu, { id: "n1", canvas: { data: { nodes: [{ id: "n1", type: "file", file: target.path }] } } });
        return menu;
    };
}

/**
 * **Right-click a file node, on a flow canvas, and it is a step** (#519, #686). #519 took
 * *Transform note into step* off every note's menu because a step only means something on a flow
 * canvas — but the canvas door it pointed to was never built for file nodes, so a note could not be
 * made into a step at all, and a note that was one could not be edited from its node.
 */
describe("a file node's right-click menu (#686)", () => {
    beforeEach(() => {
        opened.length = 0;
        writes.length = 0;
        clipboard.value = null;
        clipboard.save.mockClear();
        for (const key of Object.keys(frontmatter)) delete frontmatter[key];
        canvasFile.current = FLOW;
    });

    it("makes a plain note a step, in the step editor, on a flow canvas", () => {
        const menu = setup()(NOTE);
        expect(menu.items.map((i) => i.title)).toEqual(["Make this note a step"]);
        menu.item("Make this note a step").click();
        expect(opened).toEqual([{ info: expect.objectContaining({ filename: "Permanent" }), mode: "edit", builder: "ribbon" }]);
    });

    it("edits, copies and clears a note that already is a step", async () => {
        frontmatter[NOTE.path] = { label: "Permanent" };
        const menu = setup()(NOTE);
        expect(menu.items.map((i) => i.title)).toEqual(["Edit step", "Copy to clipboard (step configuration)", "Remove step configuration"]);
        menu.item("Edit step").click();
        expect(opened[0].info).toMatchObject({ label: "Permanent", mapped: true, filename: "Permanent" });
        menu.item("Copy to clipboard (step configuration)").click();
        expect(clipboard.save).toHaveBeenCalledWith({ label: "Permanent" });
        menu.item("Remove step configuration").click();
        await Promise.resolve();
        expect(writes).toEqual([{ path: NOTE.path, op: "remove" }]);
    });

    it("pastes a copied step onto the note", async () => {
        clipboard.value = { label: "Copied" };
        const menu = setup()(NOTE);
        menu.item("Paste from clipboard (step configuration)").click();
        await Promise.resolve();
        expect(writes).toEqual([{ path: NOTE.path, op: "set", value: { label: "Copied" } }]);
    });

    it("adds nothing on a canvas that is not a flow, or for a file that is not a note", () => {
        const open = setup();
        expect(open(PDF).items).toHaveLength(0);
        canvasFile.current = PLAIN;
        expect(open(NOTE).items).toHaveLength(0);
        canvasFile.current = null;
        expect(open(NOTE).items).toHaveLength(0);
    });
});

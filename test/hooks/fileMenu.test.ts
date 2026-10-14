import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Menu, TFile, TFolder } from "obsidian";
import { t } from "architecture/lang";

const openedCanvas: { folder: string; prefix: string }[] = [];
const frontmatter: Record<string, Record<string, unknown> | null> = {};
const clipboard: { value: unknown } = { value: null };
jest.mock("architecture/plugin", () => ({
    ObsidianConfig: {
        openCanvasFile: async (folder: { path: string }, prefix: string) => void openedCanvas.push({ folder: folder.path, prefix }),
    },
    FrontmatterService: {
        instance: (note: { path: string }) => ({
            hasZettelFlowSettings: () => Boolean(frontmatter[note.path]),
            getZettelFlowSettings: () => frontmatter[note.path],
            removeStepSettings: async () => undefined,
            setZettelFlowSettings: async () => undefined,
        }),
    },
}));
jest.mock("zettelkasten", () => ({
    StepBuilderMapper: { StepSettings2PartialStepBuilderInfo: () => ({}) },
    StepBuilderModal: class {},
}));
jest.mock("architecture/plugin/canvas", () => ({ canvas: { clipboard: { get: () => clipboard.value, save: () => undefined }, flows: { delete: () => undefined } } }));
jest.mock("architecture/plugin/canvas/flowRole", () => ({ flowRole: () => "none", flowFolders: () => ({}) }));
jest.mock("starters/zcomponents/RibbonIcon", () => ({ RibbonIcon: { ID: "zf" } }));
jest.mock("main", () => ({}));

import { FileMenu } from "hooks/FileMenu";

const SOURCE = readFileSync(join(__dirname, "..", "..", "src", "hooks", "FileMenu.ts"), "utf8");

function setup() {
    let handler: ((menu: Menu, file: unknown) => void) | null = null;
    const plugin = {
        settings: { foldersFlowsPath: "_ZettelFlow/folders", ribbonCanvas: "" },
        app: { workspace: { on: (_name: string, fn: (menu: Menu, file: unknown) => void) => ((handler = fn), { name: _name }) } },
        registerEvent: () => undefined,
    };
    FileMenu.setup(plugin as never);
    return (target: unknown) => {
        const menu = new Menu();
        handler?.(menu, target);
        return menu;
    };
}

/**
 * **The folder menu speaks your language** (#800 D6, FR-5, AC-4). *Edit folder workflow* was the one
 * English literal left in the file explorer's menu, so a Spanish vault read it in English.
 */
describe("a folder's right-click menu (#800)", () => {
    beforeEach(() => {
        openedCanvas.length = 0;
        clipboard.value = null;
        for (const key of Object.keys(frontmatter)) delete frontmatter[key];
    });

    it("titles the folder flow item from the locale, and opens the folder's canvas", async () => {
        const folder = new TFolder();
        folder.path = "Profiles";
        const menu = setup()(folder);
        expect(menu.items.map((item) => item.title)).toEqual([t("file_menu_edit_folder_workflow")]);
        menu.item(t("file_menu_edit_folder_workflow")).click();
        await Promise.resolve();
        expect(openedCanvas).toEqual([{ folder: "Profiles", prefix: "_ZettelFlow/folders" }]);
    });

    it("adds nothing for a note that is not a step", () => {
        const note = new TFile();
        note.path = "Plain.md";
        note.extension = "md";
        expect(setup()(note).items).toHaveLength(0);
    });

    it("holds no literal title or notice", () => {
        expect(SOURCE).not.toMatch(/\.setTitle\(\s*["'`]/);
        expect(SOURCE).not.toMatch(/new Notice\(\s*["'`]/);
    });
});

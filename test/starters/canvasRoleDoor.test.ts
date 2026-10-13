import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { canvasRoleDoorEntry, type MenuLike, type MenuItemLike } from "starters/zcomponents/CanvasRoleDoorComponent";

const SRC = join(__dirname, "..", "..", "src");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");
const COMPONENT = read("starters", "zcomponents", "CanvasRoleDoorComponent.ts");
const STARTERS = read("starters", "utils", "StartersTools.ts");
const EN = read("architecture", "lang", "locale", "en.ts");
const ES = read("architecture", "lang", "locale", "es.ts");

/** A menu that records what was put in it, and lets a test press the entry. */
function fakeMenu(): MenuLike & { titles: string[]; press: () => void } {
    const titles: string[] = [];
    let click: () => void = () => undefined;
    return {
        titles,
        press: () => click(),
        addItem(build: (item: MenuItemLike) => void) {
            const item: MenuItemLike = {
                setTitle(title: string) {
                    titles.push(title);
                    return item;
                },
                setIcon() {
                    return item;
                },
                onClick(callback: () => void) {
                    click = callback;
                    return item;
                },
            };
            build(item);
            return item;
        },
    };
}

/**
 * The welcome screen said "open a canvas and give it the *Creates notes* role", and a canvas
 * without a role shows nothing of ZettelFlow — the instruction led to a dead end. The canvas's own
 * menu is now where that role is given.
 */
describe("a canvas offers to create notes from its own menu", () => {
    it("offers it on a canvas with no role, and opens the role dialog for that canvas", () => {
        const menu = fakeMenu();
        const open = jest.fn();
        expect(canvasRoleDoorEntry(menu, "flows/Daily.canvas", {}, open)).toBe(true);
        expect(menu.titles).toEqual(["Use this canvas to create notes"]);
        expect(open).not.toHaveBeenCalled();
        menu.press();
        expect(open).toHaveBeenCalledWith("flows/Daily.canvas");
    });

    it("offers it on a canvas that holds another role — the dialog says what it gives up", () => {
        const menu = fakeMenu();
        expect(canvasRoleDoorEntry(menu, "flows/Edit.canvas", { editorCanvas: "flows/Edit.canvas" }, jest.fn())).toBe(true);
    });

    it("offers nothing on the canvas that already creates notes", () => {
        const menu = fakeMenu();
        expect(canvasRoleDoorEntry(menu, "flows/Daily.canvas", { ribbonCanvas: "flows/Daily.canvas" }, jest.fn())).toBe(false);
        expect(menu.titles).toHaveLength(0);
    });

    it("offers nothing on a note", () => {
        const menu = fakeMenu();
        expect(canvasRoleDoorEntry(menu, "Notes/Idea.md", {}, jest.fn())).toBe(false);
        expect(menu.titles).toHaveLength(0);
    });

    it("gives the role through the same dialog the settings use, and refreshes the open canvas", () => {
        expect(COMPONENT).toContain('new AssignRoleModal(this.plugin.app, this.plugin, path, "create"');
        expect(COMPONENT).toContain('"zettelflow-canvas-render"');
        expect(STARTERS).toContain("new CanvasRoleDoorComponent(plugin)");
    });

    it("registers no command — the palette is not where anyone discovers anything (#496)", () => {
        expect(COMPONENT).not.toContain("addCommand(");
    });

    it("says it in both languages, and the welcome screen points at it", () => {
        expect(EN).toContain("canvas_role_door_create: 'Use this canvas to create notes',");
        expect(ES).toContain("canvas_role_door_create: 'Usar este canvas para crear notas',");
        expect(EN).toContain("onboarding_way_own_detail: 'Right-click a canvas → Use this canvas to create notes.',");
    });
});

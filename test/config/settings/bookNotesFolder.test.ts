import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Setting, __captureSettings } from "obsidian";
import { DomNode } from "../../support/dashboardDom";

// The folder suggest reaches the live app; under jest it only hands back what a choice would call.
const suggestChoices: ((path: string) => void)[] = [];
jest.mock("architecture/settings", () => ({
    FolderSuggest: class {
        constructor(_input: unknown, onChoose?: (path: string) => void) {
            if (onChoose) suggestChoices.push(onChoose);
        }
    },
}));
jest.mock("architecture/api", () => ({
    fnsManager: { invalidateCache: jest.fn() },
    writeTypeDeclarations: jest.fn(async () => ({ status: "written", path: "x" })),
}));

import { readingSettingsGroup } from "config/modals/handlers/readingSettingsGroup";
import { foldersSettingsGroup } from "config/modals/handlers/advancedSettingsGroups";
import { DEFAULT_SETTINGS } from "config/typing";

type Item = { name?: string; aliases?: string[]; render?: (setting: Setting) => void };
type Fake = { value: string; tooltip?: string; type?: (v: string) => void; click?: () => void; inputEl?: { fire?: (type: string, event?: unknown) => void } };
type Drawn = Setting & { settingEl: DomNode; searches: Fake[]; extraButtons: Fake[]; buttons: Fake[] };

function plugin(settings: Record<string, unknown> = {}) {
    const createFolder = jest.fn(async () => undefined);
    return {
        settings: { ...structuredClone(DEFAULT_SETTINGS), ...settings } as Record<string, any>,
        saveSettings: jest.fn(async () => undefined),
        app: { vault: { createFolder }, workspace: { getLeavesOfType: () => [] } },
        createFolder,
    };
}

const items = (group: unknown) => (group as { items: Item[] }).items;
const byName = (list: Item[], name: string) => list.find((item) => item.name === name)!;
function draw(item: Item): Drawn {
    __captureSettings(() => undefined);
    const setting = new Setting(new DomNode()) as Drawn;
    item.render!(setting);
    return setting;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => __captureSettings(null));

describe("the Book notes folder, where reading is set (#743 AC-11)", () => {
    it("reads Library until you choose", () => {
        expect(DEFAULT_SETTINGS.bookNotesFolder).toBe("Library");
        const row = draw(byName(items(readingSettingsGroup(plugin() as never)), "Book notes folder"));
        expect(row.searches[0].value).toBe("Library");
        expect(row.settingEl.hasClass("zettelkasten-flow__settings-book-notes-row")).toBe(true);
    });

    it("saves a folder when you leave the field, and makes no folder for it", async () => {
        jest.useFakeTimers();
        try {
            const p = plugin();
            const changed = jest.fn();
            const row = draw(byName(items(readingSettingsGroup(p as never, changed)), "Book notes folder"));
            for (const step of ["R", "Reading", "Reading notes"]) row.searches[0].type!(step);
            expect(p.saveSettings).not.toHaveBeenCalled();
            row.searches[0].inputEl!.fire!("blur");
            await jest.advanceTimersByTimeAsync(250);
            expect(p.settings.bookNotesFolder).toBe("Reading notes");
            expect(p.saveSettings).toHaveBeenCalledTimes(1);
            expect(changed).toHaveBeenCalledTimes(1);
            expect(p.createFolder).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it("saves on Enter and on a chosen suggestion, and the reset puts Library back", async () => {
        const p = plugin();
        const row = draw(byName(items(readingSettingsGroup(p as never)), "Book notes folder"));
        row.searches[0].type!("Sources/Books");
        row.searches[0].inputEl!.fire!("keydown", { key: "Enter" });
        await flush();
        expect(p.settings.bookNotesFolder).toBe("Sources/Books");
        suggestChoices[suggestChoices.length - 1]("Reading notes");
        await flush();
        expect(p.settings.bookNotesFolder).toBe("Reading notes");
        expect(row.extraButtons[0].tooltip).toBe("Reset to default");
        row.extraButtons[0].click!();
        await flush();
        expect(p.settings.bookNotesFolder).toBe("Library");
        expect(row.searches[0].value).toBe("Library");
        expect(p.createFolder).not.toHaveBeenCalled();
    });

    it("is shown in Folders ZettelFlow uses, not edited there, with a way to Reading", () => {
        const go = jest.fn();
        let refresh: (() => void) | null = null;
        const p = plugin({ bookNotesFolder: "Reading notes" });
        const list = items(foldersSettingsGroup(p as never, () => true, jest.fn(), () => undefined, { bookNotes: { go, onPointer: (fn) => (refresh = fn) } }));
        expect(list.map((item) => item.name).slice(-2)).toEqual(["Thinking space", "Book notes"]);
        const cell = byName(list, "Book notes");
        expect(cell.aliases).toEqual(["Book notes folder"]);
        const row = draw(cell);
        expect(row.searches).toHaveLength(0);
        expect(row.buttons).toHaveLength(0);
        expect(row.settingEl.oneByClass("settings-folder-path").text).toBe("Reading notes");
        expect(row.extraButtons[0].tooltip).toBe("Go to the book notes setting");
        row.extraButtons[0].click!();
        expect(go).toHaveBeenCalledTimes(1);
        p.settings.bookNotesFolder = "Elsewhere";
        refresh!();
        expect(row.settingEl.oneByClass("settings-folder-path").text).toBe("Elsewhere");
    });
});

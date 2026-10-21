import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Setting, __captureSettings } from "obsidian";
import { DomNode } from "../../support/dashboardDom";

jest.mock("architecture/settings", () => ({
    FolderSuggest: class {
        constructor() {}
    },
}));
jest.mock("architecture/api", () => ({
    fnsManager: { invalidateCache: jest.fn() },
    writeTypeDeclarations: jest.fn(async () => ({ status: "written", path: "x" })),
}));

import { dictionariesSettingsGroup, readingSettingsGroup, type ArchiveSettingsDeps } from "config/modals/handlers/readingSettingsGroup";
import { foldersSettingsGroup } from "config/modals/handlers/advancedSettingsGroups";
import { DEFAULT_SETTINGS } from "config/typing";
import type { ShelfItem } from "application/library/shelf";

type Item = { name?: string; aliases?: string[]; render?: (setting: Setting) => void };
type Fake = { value: string; tooltip?: string; type?: (v: string) => void; click?: () => void; inputEl?: { fire?: (type: string, event?: unknown) => void } };
type Drawn = Setting & { settingEl: DomNode; descEl: DomNode; searches: Fake[]; extraButtons: Fake[] };

function plugin(settings: Record<string, unknown> = {}) {
    return {
        settings: { ...structuredClone(DEFAULT_SETTINGS), ...settings } as Record<string, any>,
        saveSettings: jest.fn(async () => undefined),
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
const message = (row: Drawn) => row.settingEl.oneByClass("settings-folder-message");
const enter = async (row: Drawn, value: string) => {
    row.searches[0].type!(value);
    row.searches[0].inputEl!.fire!("keydown", { key: "Enter" });
    await flush();
};

const shelfItem = (file: string, kind: ShelfItem["kind"]): ShelfItem => ({ id: file, kind, format: kind === "article" ? "article" : "pdf", title: file, file, progress: 0, highlights: 0, born: 0, lastRead: 0 });
function deps(archived: ShelfItem[] = []): ArchiveSettingsDeps & { moved: jest.Mock; forgot: jest.Mock } {
    const moved = jest.fn(async () => undefined);
    const forgot = jest.fn(async () => undefined);
    return { archivedIn: () => archived, move: moved, forget: forgot, moved, forgot } as never;
}
const archiveRow = (p: ReturnType<typeof plugin>, d = deps(), changed = jest.fn()) =>
    draw(byName(items(readingSettingsGroup(p as never, undefined, undefined, undefined, changed, d)), "Archive folder"));

afterEach(() => __captureSettings(null));

describe("the Archive folder, where reading is set (#865 FR-1, FR-2)", () => {
    it("reads Library archive until you choose, with a reset", async () => {
        expect(DEFAULT_SETTINGS.libraryArchiveFolder).toBe("Library archive");
        const p = plugin({ libraryArchiveFolder: "Put away" });
        const row = archiveRow(p);
        expect(row.searches[0].value).toBe("Put away");
        expect(row.settingEl.hasClass("zettelkasten-flow__settings-archive-row")).toBe(true);
        expect(row.extraButtons[0].tooltip).toBe("Reset to default");
        row.extraButtons[0].click!();
        await flush();
        expect(p.settings.libraryArchiveFolder).toBe("Library archive");
    });

    it("says the archive is off when emptied, and saves the empty choice (AC-10)", async () => {
        const p = plugin();
        const changed = jest.fn();
        const row = archiveRow(p, deps(), changed);
        await enter(row, "");
        expect(p.settings.libraryArchiveFolder).toBe("");
        expect(message(row).text).toBe("The archive is off: nothing can be archived, and the cabinet is not in the Library.");
        expect(changed).toHaveBeenCalledTimes(1);
    });
});

describe("each Library folder is its own (#865 FR-3, FR-4, AC-9)", () => {
    it.each([
        ["Library", "That is the book notes folder. Each folder of the Library needs its own."],
        ["Clippings/old", "That is inside the articles folder (Clippings/). Pick a folder outside it."],
        ["Reference", "That holds the dictionaries folder (Reference/Dictionaries/). Pick a folder that does not contain it."],
    ])("refuses %s, says why while typing, and keeps the last valid value", async (value, said) => {
        const p = plugin({ dictionaries: { folder: "Reference/Dictionaries", languages: {}, translateInto: "" } });
        const row = archiveRow(p);
        row.searches[0].type!(value);
        expect(message(row).text).toBe(said);
        expect(message(row).hasClass("zettelkasten-flow__settings-folder-message--invalid")).toBe(true);
        row.searches[0].inputEl!.fire!("keydown", { key: "Enter" });
        await flush();
        expect(p.settings.libraryArchiveFolder).toBe("Library archive");
        expect(row.searches[0].value).toBe("Library archive");
        expect(p.saveSettings).not.toHaveBeenCalled();
    });

    it("the other folders refuse the archive's too", async () => {
        const p = plugin();
        const group = items(readingSettingsGroup(p as never));
        const notes = draw(byName(group, "Book notes folder"));
        await enter(notes, "Library archive/x");
        expect(p.settings.bookNotesFolder).toBe("Library");
        expect(message(notes).text).toBe("That is inside the archive folder (Library archive/). Pick a folder outside it.");
        const articles = draw(byName(group, "Articles folder"));
        await enter(articles, "library ARCHIVE");
        expect(p.settings.articlesFolder).toBe("Clippings");
        const dictionaries = draw(byName(items(dictionariesSettingsGroup(p as never, { shelf: { list: () => [], info: async () => ({}) as never, forget: () => undefined } })), "Dictionaries folder"));
        await enter(dictionaries, "Library archive");
        expect(p.settings.dictionaries.folder).toBe("Dictionaries");
    });
});

describe("changing the folder with things archived (#865 FR-5, AC-11)", () => {
    it("offers to move them or leave them, counting books and papers apart from articles", async () => {
        const p = plugin();
        const d = deps([shelfItem("Library archive/a.pdf", "paper"), shelfItem("Library archive/b.epub", "book"), shelfItem("Library archive/c.md", "article")]);
        const row = archiveRow(p, d);
        await enter(row, "Put away");
        expect(p.settings.libraryArchiveFolder).toBe("Put away");
        const offer = row.settingEl.oneByClass("settings-archive-offer");
        expect(offer.textContent).toContain("Still in Library archive/: 2 books or papers · 1 article.");
        expect(offer.textContent).toContain("If you leave them, books and papers go back on the shelves.");
        expect(offer.textContent).toContain("If you leave them, articles stay in Library archive/ as ordinary notes, outside the Library.");
        const [move] = offer.findAll((el) => el.tag === "button");
        expect(move.text).toBe("Move them to Put away/");
        move.click();
        await flush();
        expect(d.moved).toHaveBeenCalledWith(expect.any(Array), "Put away");
        expect(offer.textContent).toBe("Moved to Put away/.");
    });

    it("leaves out the article warning when no article is archived, and Leave them only forgets", async () => {
        const p = plugin();
        const d = deps([shelfItem("Library archive/a.pdf", "paper")]);
        const row = archiveRow(p, d);
        await enter(row, "Put away");
        const offer = row.settingEl.oneByClass("settings-archive-offer");
        expect(offer.textContent).toContain("1 book or paper");
        expect(offer.textContent).not.toContain("articles stay");
        offer.findAll((el) => el.tag === "button")[1].click();
        await flush();
        expect(d.forgot).toHaveBeenCalledTimes(1);
        expect(d.moved).not.toHaveBeenCalled();
    });

    it("offers nothing when nothing is archived", async () => {
        const p = plugin();
        const row = archiveRow(p);
        await enter(row, "Put away");
        expect(row.settingEl.oneByClass("settings-archive-offer").textContent).toBe("");
    });
});

describe("the archive in Folders ZettelFlow uses (#865 FR-6)", () => {
    it("is shown, not edited, with a way to Reading", () => {
        const go = jest.fn();
        const p = plugin({ libraryArchiveFolder: "Put away" });
        const list = items(foldersSettingsGroup(p as never, () => true, jest.fn(), () => undefined, { archive: { go } }));
        const cell = byName(list, "Library archive");
        expect(cell.aliases).toEqual(["Archive folder"]);
        const row = draw(cell);
        expect(row.searches).toHaveLength(0);
        expect(row.settingEl.oneByClass("settings-folder-path").text).toBe("Put away");
        row.extraButtons[0].click!();
        expect(go).toHaveBeenCalledTimes(1);
    });
});

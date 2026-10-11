/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Setting, TFile, __captureSettings } from "obsidian";
import { DomNode, settle } from "../support/dashboardDom";
import { buildStardict } from "../support/stardictFixture";
import { dictionariesSettingsGroup } from "config/modals/handlers/readingSettingsGroup";
import { foldersSettingsGroup } from "config/modals/handlers/advancedSettingsGroups";
import { DictionaryShelf } from "architecture/plugin/library/DictionaryShelf";
import { DEFAULT_SETTINGS } from "config/typing";
import { dictionarySettings } from "application/library/dictionarySettings";

/** **Settings → Reading: your dictionaries, and Translate's language** (#766 FR-2, FR-3, FR-9, AC-7). */
type Item = { name?: string; render?: (setting: Setting) => void };
type Drawn = Setting & { settingEl: DomNode; searches: any[]; extraButtons: any[]; dropdowns: any[] };

function draw(item: Item): Drawn {
    __captureSettings(() => undefined);
    const setting = new Setting(new DomNode()) as Drawn;
    item.render!(setting);
    return setting;
}

const enc = new TextEncoder();
function shelfOver(files: Record<string, Uint8Array | string>) {
    const made = Object.entries(files).map(([path, data]) => {
        const file = new TFile() as any;
        file.path = path;
        const bytes = typeof data === "string" ? enc.encode(data) : data;
        file.stat = { size: bytes.length, mtime: 1 };
        return { file, bytes };
    });
    const vault = {
        getFiles: () => made.map((m) => m.file),
        readBinary: jest.fn(async (file: TFile) => {
            const found = made.find((m) => m.file === file)!;
            return found.bytes.buffer.slice(found.bytes.byteOffset, found.bytes.byteOffset + found.bytes.byteLength);
        }),
    };
    return { shelf: new DictionaryShelf(() => vault as never), vault };
}

function files() {
    const mono = buildStardict([{ word: "casa", definition: "Edificio." }], { bookname: "Wiktionary (Spanish)", lang: "es" });
    const plain = buildStardict([{ word: "casa", definition: "house" }], { bookname: "Plain spa-eng" });
    const broken = buildStardict([{ word: "x", definition: "y" }], { bookname: "Broken" });
    return {
        "Dictionaries/wiktionary-es.ifo": mono.ifo,
        "Dictionaries/wiktionary-es.idx": mono.idx,
        "Dictionaries/wiktionary-es.dict": mono.dict,
        "Dictionaries/plain/plain.ifo": plain.ifo,
        "Dictionaries/plain/plain.idx": plain.idx,
        "Dictionaries/plain/plain.dict": plain.dict,
        "Dictionaries/broken.ifo": broken.ifo,
        "Dictionaries/broken.dict": broken.dict,
    };
}

function plugin(dictionaries?: unknown) {
    return { settings: { ...structuredClone(DEFAULT_SETTINGS), ...(dictionaries === undefined ? {} : { dictionaries }) } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
}

const items = (group: unknown) => (group as { items: Item[] }).items;
const byName = (list: Item[], name: string) => list.find((item) => item.name === name)!;

afterEach(() => __captureSettings(null));

describe("the dictionaries folder (#766 FR-2, AC-7)", () => {
    it("reads Dictionaries by default, an older data.json included", () => {
        expect(DEFAULT_SETTINGS.dictionaries).toEqual({ folder: "Dictionaries", languages: {}, translateInto: "" });
        expect(dictionarySettings(undefined)).toEqual({ folder: "Dictionaries", languages: {}, translateInto: "" });
        expect(dictionarySettings({ folder: "  " }).folder).toBe("Dictionaries");
        expect(dictionarySettings({ folder: 3, languages: { a: { from: "es" }, b: { from: "!!" } }, translateInto: "xx yy" })).toEqual({ folder: "Dictionaries", languages: { a: { from: "es" } }, translateInto: "" });
    });

    it("is a folder field with suggestions, committed on Enter, with a reset to Dictionaries", async () => {
        const p = plugin();
        const onFolder = jest.fn();
        const { shelf } = shelfOver(files());
        const forget = jest.spyOn(shelf, "forget");
        const row = draw(byName(items(dictionariesSettingsGroup(p as never, { shelf, ui: () => "en", onFolder })), "Dictionaries folder"));
        expect(row.searches[0].value).toBe("Dictionaries");
        row.searches[0].type("Reading/Dicts");
        row.searches[0].inputEl.fire("keydown", { key: "Enter" });
        await settle(() => p.saveSettings.mock.calls.length > 0);
        expect(p.settings.dictionaries.folder).toBe("Reading/Dicts");
        expect(forget).toHaveBeenCalled();
        expect(onFolder).toHaveBeenCalled();
        row.extraButtons[0].click();
        await settle(() => p.settings.dictionaries.folder === "Dictionaries");
        expect(p.settings.dictionaries.folder).toBe("Dictionaries");
    });
});

describe("what was found, and its languages (#766 FR-3, AC-7)", () => {
    it("lists each dictionary by its name with from → to, and an incomplete set with why", async () => {
        const { shelf } = shelfOver(files());
        const row = draw(byName(items(dictionariesSettingsGroup(plugin() as never, { shelf, ui: () => "en" })), "Found here"));
        await settle(() => row.settingEl.byClass("settings-dictionary-name").every((el) => !/^(wiktionary-es|plain)$/.test(el.textContent)));
        const rows = row.settingEl.byClass("settings-dictionary").map((el) => [el.oneByClass("settings-dictionary-name").textContent, el.oneByClass("settings-dictionary-line").textContent]);
        expect(rows).toEqual([
            ["broken", "Missing its .idx"],
            ["Plain spa-eng", "It declares no languages: set them once"],
            ["Wiktionary (Spanish)", "Spanish"],
        ]);
    });

    it("shows the two language fields only for a dictionary that declares none, and keeps them in the settings", async () => {
        const p = plugin();
        const { shelf } = shelfOver(files());
        const row = draw(byName(items(dictionariesSettingsGroup(p as never, { shelf, ui: () => "en" })), "Found here"));
        await settle(() => row.settingEl.byClass("settings-dictionary-fields").length > 0);
        const fields = row.settingEl.byClass("settings-dictionary-fields");
        expect(fields).toHaveLength(1);
        const [from, to] = fields[0].findAll((el) => el.tag === "input");
        expect([from.getAttribute("placeholder"), to.getAttribute("placeholder")]).toEqual(["From", "To"]);
        from.value = "es";
        to.value = "en";
        to.fire("keydown", { key: "Enter" });
        await settle(() => p.saveSettings.mock.calls.length > 0);
        expect(p.settings.dictionaries.languages).toEqual({ "Dictionaries/plain/plain": { from: "es", to: "en" } });
        await settle(() => row.settingEl.textContent.includes("Spanish → English"));
        expect(row.settingEl.textContent).toContain("Spanish → English");
    });

    it("says so when the folder holds none", () => {
        const { shelf } = shelfOver({});
        const row = draw(byName(items(dictionariesSettingsGroup(plugin() as never, { shelf, ui: () => "en" })), "Found here"));
        expect(row.settingEl.textContent).toContain("None yet: put a StarDict dictionary's files in this folder.");
    });
});

describe("Translate into (#766 FR-9, AC-7)", () => {
    it("offers Obsidian's language first, then the languages by name, and saves the pick", async () => {
        const p = plugin();
        const row = draw(byName(items(dictionariesSettingsGroup(p as never, { shelf: shelfOver({}).shelf, ui: () => "en" })), "Translate into"));
        const dropdown = row.dropdowns[0];
        expect(dropdown.options[0]).toEqual(["", "Obsidian's language"]);
        expect(dropdown.options.slice(1, 3)).toEqual([
            ["en", "English"],
            ["es", "Spanish"],
        ]);
        dropdown.select("es");
        await settle(() => p.saveSettings.mock.calls.length > 0);
        expect(p.settings.dictionaries.translateInto).toBe("es");
    });
});

describe("the Folders ZettelFlow uses grid (#766 FR-2, AC-7)", () => {
    it("shows the dictionaries folder read-only, with a way to Reading, in step with it", () => {
        const p = plugin({ folder: "Reading/Dicts", languages: {}, translateInto: "" });
        const go = jest.fn();
        let refresh: (() => void) | null = null;
        const cells = items(foldersSettingsGroup(p as never, () => true, jest.fn(), () => undefined, { go, onPointer: (fn) => (refresh = fn) }));
        const row = draw(byName(cells, "Dictionaries"));
        expect(row.searches).toHaveLength(0);
        expect(row.settingEl.oneByClass("settings-folder-path").text).toBe("Reading/Dicts");
        expect(row.extraButtons[0].tooltip).toBe("Change it in Reading");
        row.extraButtons[0].click();
        expect(go).toHaveBeenCalled();
        p.settings.dictionaries = { folder: "Elsewhere", languages: {}, translateInto: "" };
        refresh!();
        expect(row.settingEl.oneByClass("settings-folder-path").text).toBe("Elsewhere");
    });

    it("is wired in the tab, under Reading, and in the grid", () => {
        const tab = readFileSync(join(__dirname, "..", "..", "src", "config", "modals", "ZettelFlowSettingsTab.tsx"), "utf8");
        expect(tab.indexOf("dictionariesSettingsGroup(plugin")).toBeGreaterThan(tab.indexOf("readingSettingsGroup(plugin)"));
        expect(tab.indexOf("dictionariesSettingsGroup(plugin")).toBeLessThan(tab.indexOf('this.sectionHead("ai")'));
        expect(tab).toContain("go: () => this.goToDictionariesFolder()");
    });
});

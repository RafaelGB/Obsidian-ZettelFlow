import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Setting, __captureSettings } from "obsidian";
import { DomNode } from "../../support/dashboardDom";

// The folder suggest reaches the live app; a row drawn under jest only needs it to exist.
jest.mock("architecture/settings", () => ({ FolderSuggest: class { constructor(_input: unknown) {} } }));

import { renderExcludedChips, knowledgeSettingsGroups } from "config/modals/handlers/knowledgeSettingsGroups";
import { movesSettingsGroup, movesCountLabel } from "config/modals/handlers/movesSettingsGroup";
import { returnSettingsGroup } from "config/modals/handlers/returnSettingsGroup";
import { rememberedSettingsGroup } from "config/modals/handlers/rememberedSettingsGroup";
import { daysLabel } from "config/modals/handlers/durationLabel";
import { DEFAULT_SETTINGS } from "config/typing";

type Item = { name?: string; render?: (setting: Setting) => void };
type Drawn = Setting & {
    settingEl: DomNode;
    descEl: DomNode;
    controlEl: DomNode;
    toggles: { value: boolean; flip: (on?: boolean) => void }[];
    sliders: { value: number; slide: (v: number) => void; sliderEl: DomNode }[];
    searches: { placeholder: string }[];
};

const host = () => new DomNode() as unknown as HTMLElement & DomNode;

function plugin(settings: Record<string, unknown> = {}) {
    return {
        settings: { ...structuredClone(DEFAULT_SETTINGS), ...settings } as Record<string, unknown>,
        saveSettings: jest.fn(async () => undefined),
        app: { workspace: { getLeavesOfType: () => [] } },
    };
}

const itemsOf = (group: unknown) => (group as { items: Item[] }).items;

/** Draw one declarative row into a fake `Setting`, the way Obsidian would. */
function draw(item: Item): Drawn {
    __captureSettings(() => undefined);
    const setting = new Setting(new DomNode()) as Drawn;
    item.render!(setting);
    return setting;
}

const byName = (items: Item[], name: string) => {
    const item = items.find((candidate) => candidate.name === name);
    if (!item) throw new Error(`no row named ${name}`);
    return item;
};

afterEach(() => __captureSettings(null));

describe("excluded folders as chips (#662)", () => {
    it("draws one removable chip per folder, and says so when there is none", () => {
        const el = host();
        renderExcludedChips(el, ["_templates", "Attachments"], { remove: jest.fn(), add: jest.fn() });
        expect(el.byClass("settings-chip-label").map((chip) => chip.textContent)).toEqual(["_templates", "Attachments"]);

        const empty = host();
        renderExcludedChips(empty, [], { remove: jest.fn(), add: jest.fn() });
        expect(empty.byClass("excluded-paths-empty")[0].textContent).toBe("No folders excluded yet.");
    });

    it("removes a folder and adds one through the row, persisting both", () => {
        const p = plugin({ excludedPaths: ["_templates", "Attachments"] });
        const scope = itemsOf(knowledgeSettingsGroups(p as never)[0]);
        const row = draw(byName(scope, "Excluded folders"));
        const removes = row.settingEl.byClass("settings-chip-remove");
        removes[0].click();
        expect(p.settings.excludedPaths).toEqual(["Attachments"]);
        expect(p.saveSettings).toHaveBeenCalled();
        // The chips redraw from the setting, in place.
        expect(row.settingEl.byClass("settings-chip-label").map((chip) => chip.textContent)).toEqual(["Attachments"]);
    });

    it("draws again without stacking a second list", () => {
        const p = plugin({ excludedPaths: ["A"] });
        const scope = itemsOf(knowledgeSettingsGroups(p as never)[0]);
        __captureSettings(() => undefined);
        const setting = new Setting(new DomNode()) as Drawn;
        const row = byName(scope, "Excluded folders");
        row.render!(setting);
        row.render!(setting);
        expect(setting.settingEl.byClass("excluded-paths-list")).toHaveLength(1);
    });

    it("lays the three lifecycle properties out as one row of fields", () => {
        const lifecycle = knowledgeSettingsGroups(plugin() as never)[1] as { cls?: string; items: Item[] };
        expect(lifecycle.cls).toBe("zettelkasten-flow__settings-fields");
        const names = lifecycle.items.map((item) => item.name);
        expect(names).toContain("State property");
        expect(names).toContain("Created property");
        expect(names).toContain("Last-reviewed property");
    });
});

describe("the cultivate moves as a grid (#662)", () => {
    it("says how many are on, and keeps the count current as you flip one", () => {
        const p = plugin({ cultivateMoves: undefined });
        const items = itemsOf(movesSettingsGroup(p as never));
        const intro = draw(items[0]);
        expect(intro.descEl.byClass("settings-moves-count")[0].textContent).toBe("5 of 5 are on");

        const challenge = draw(byName(items, "Challenge it"));
        expect(challenge.settingEl.hasClass("zettelkasten-flow__settings-tile")).toBe(true);
        challenge.toggles[0].flip(false);
        expect(p.settings.cultivateMoves).toEqual(["connect", "question", "advance", "source"]);
        expect(intro.descEl.byClass("settings-moves-count")[0].textContent).toBe("4 of 5 are on");
        expect(p.saveSettings).toHaveBeenCalled();
    });

    it("keeps the canonical order when a move comes back", () => {
        const p = plugin({ cultivateMoves: ["question", "source"] });
        const items = itemsOf(movesSettingsGroup(p as never));
        draw(items[0]);
        draw(byName(items, "Connect it")).toggles[0].flip(true);
        expect(p.settings.cultivateMoves).toEqual(["connect", "question", "source"]);
    });

    it("agrees in number", () => {
        expect(movesCountLabel(1)).toBe("1 of 5 is on");
        expect(movesCountLabel(3)).toBe("3 of 5 are on");
    });
});

describe("returns and the thinking space (#662)", () => {
    it("says the duration the slider stands for, as you drag it", () => {
        const p = plugin({ returnIntervalDays: 90 });
        const items = itemsOf(returnSettingsGroup(p as never));
        const row = draw(items[0]);
        const value = () => row.controlEl.byClass("settings-slider-value")[0].textContent;
        expect(value()).toBe("90 days");
        row.sliders[0].slide(120);
        expect(value()).toBe("120 days");
        expect(p.settings.returnIntervalDays).toBe(120);
        expect(p.saveSettings).toHaveBeenCalled();
    });

    it("words a single day as one", () => {
        expect(daysLabel(1)).toBe("1 day");
        expect(daysLabel(30)).toBe("30 days");
    });

    it("offers the thinking space's real default as its placeholder", () => {
        const items = itemsOf(returnSettingsGroup(plugin() as never));
        const row = draw(byName(items, "Thinking space folder"));
        expect(row.searches[0].placeholder).toBe(DEFAULT_SETTINGS.thoughtLabPath);
        expect(row.searches[0].placeholder).toBe("_ZettelFlow/lab");
    });

    it("gives the thinking space folder room for a whole path, like the folders under Advanced", () => {
        const row = draw(byName(itemsOf(returnSettingsGroup(plugin() as never)), "Thinking space folder"));
        // The row's default control column showed "4. 📒" of a nested path.
        expect(row.settingEl.hasClass("zettelkasten-flow__settings-folder-wide")).toBe(true);
    });

    it("saves the thinking space folder when you leave the field or press Enter — never per keystroke", async () => {
        jest.useFakeTimers();
        try {
            const p = plugin({ thoughtLabPath: "Lab" });
            const changed = jest.fn();
            const row = draw(byName(itemsOf(returnSettingsGroup(p as never, changed)), "Thinking space folder"));
            const field = row.searches[0] as unknown as { type(v: string): void; inputEl: { fire(t: string, e?: unknown): void } };
            // Each keystroke used to save and re-scope what the knowledge model leaves out.
            field.type("T");
            field.type("Th");
            expect(p.saveSettings).not.toHaveBeenCalled();
            expect(p.settings.thoughtLabPath).toBe("Lab");
            field.inputEl.fire("keydown", { key: "Enter", isComposing: false });
            await Promise.resolve();
            expect(p.settings.thoughtLabPath).toBe("Th");
            expect(p.saveSettings).toHaveBeenCalledTimes(1);
            expect(changed).toHaveBeenCalledTimes(1);
            field.type("Think");
            field.inputEl.fire("blur");
            jest.advanceTimersByTime(250);
            await Promise.resolve();
            expect(p.settings.thoughtLabPath).toBe("Think");
            expect(p.saveSettings).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });

    it("finishes a pattern after indexing from the same card", () => {
        const names = itemsOf(returnSettingsGroup(plugin() as never)).map((item) => item.name);
        expect(names).toContain("Re-run a pattern after the note is indexed");
    });
});

describe("what ZettelFlow remembers (#662)", () => {
    it("draws three privacy tiles, each with its switch and a lock line saying what is stored", () => {
        const group = rememberedSettingsGroup(plugin() as never) as { cls?: string; items: Item[] };
        expect(group.cls).toBe("zettelkasten-flow__settings-tiles");
        const tiles = group.items.map(draw);
        expect(tiles).toHaveLength(3);
        for (const tile of tiles) {
            expect(tile.settingEl.hasClass("zettelkasten-flow__settings-tile")).toBe(true);
            expect(tile.toggles).toHaveLength(1);
            expect(tile.descEl.byClass("settings-lock-line")[0].textContent.length).toBeGreaterThan(20);
            expect(tile.descEl.byClass("settings-lock-icon")[0].getAttribute("data-icon")).toBe("lock");
        }
    });

    it("persists each switch, and turning snapshots off still clears what was captured", () => {
        const p = plugin({
            journal: { enabled: true, days: {} },
            judgements: { enabled: true, entries: [] },
            timeline: { enabled: true, snapshots: { "a.md": [{ at: 1 }] } },
        });
        const [journal, decisions, snapshots] = (rememberedSettingsGroup(p as never) as { items: Item[] }).items.map(draw);
        journal.toggles[0].flip(false);
        decisions.toggles[0].flip(false);
        snapshots.toggles[0].flip(false);
        expect((p.settings.journal as { enabled: boolean }).enabled).toBe(false);
        expect((p.settings.judgements as { enabled: boolean }).enabled).toBe(false);
        expect(p.settings.timeline).toEqual({ enabled: false, snapshots: {} });
        expect(p.saveSettings).toHaveBeenCalledTimes(3);
    });
});

describe("the stylesheet lays cards out as grids, with the theme (#662)", () => {
    const scss = readFileSync(join(__dirname, "../../../src/styles/components/settingsSections.scss"), "utf8");

    it("grids the tiles and the fields without depending on Obsidian's inner class names", () => {
        expect(scss).toMatch(/settings-tiles[^{]*:has\(> \.zettelkasten-flow__settings-tile\)/);
        expect(scss).toMatch(/settings-fields[^{]*:has\(> \.zettelkasten-flow__settings-field\)/);
    });
});

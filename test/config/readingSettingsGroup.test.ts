import { describe, it, expect, jest } from "@jest/globals";
import type { SettingGroupItem } from "obsidian";
import { DEFAULT_SETTINGS } from "config/typing";
import { readingMotion, OPEN_MOTIONS, CHAPTER_MOTIONS } from "architecture/components/core/reader/readingMotion";
import { readingSettingsGroup } from "config/modals/handlers/readingSettingsGroup";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/** A dropdown that remembers what it was given, and lets the test pick an option. */
function fakeDropdown() {
    const options: [string, string][] = [];
    let value = "";
    let change: ((value: string) => unknown) | null = null;
    const api = {
        addOption(key: string, label: string) {
            options.push([key, label]);
            return api;
        },
        setValue(next: string) {
            value = next;
            return api;
        },
        onChange(cb: (value: string) => unknown) {
            change = cb;
            return api;
        },
    };
    return { api, options, value: () => value, pick: (next: string) => change?.(next) };
}

function renderRow(item: SettingGroupItem) {
    const dropdown = fakeDropdown();
    const setting = { addDropdown: (cb: (d: unknown) => void) => cb(dropdown.api) };
    (item as { render: (s: unknown) => void }).render(setting);
    return dropdown;
}

function plugin(readingMotionSetting?: unknown) {
    return {
        settings: { ...DEFAULT_SETTINGS, readingMotion: readingMotionSetting },
        saveSettings: jest.fn(async () => undefined),
    };
}

describe("how a book opens and a chapter turns (#732)", () => {
    it("opens with the camera shot and turns a leaf until you choose otherwise", () => {
        expect(DEFAULT_SETTINGS.readingMotion).toEqual({ open: "shot", chapter: "leaf" });
        expect(readingMotion(undefined)).toEqual({ open: "shot", chapter: "leaf" });
    });

    it("keeps a valid choice and mends anything else", () => {
        expect(readingMotion({ open: "instant", chapter: "flow" })).toEqual({ open: "instant", chapter: "flow" });
        expect(readingMotion({ open: "zoom", chapter: 3 })).toEqual({ open: "shot", chapter: "leaf" });
        expect(OPEN_MOTIONS).toEqual(["shot", "instant"]);
        expect(CHAPTER_MOTIONS).toEqual(["leaf", "flow", "stack"]);
    });

    it("offers both choices in the Reading section and saves what you pick", async () => {
        const host = plugin({ open: "shot", chapter: "leaf" });
        const group = readingSettingsGroup(host as never) as { items: SettingGroupItem[] };
        expect(group.items).toHaveLength(5);

        const open = renderRow(group.items[0]);
        expect(open.options.map(([key]) => key)).toEqual(["shot", "instant"]);
        expect(open.value()).toBe("shot");
        await open.pick("instant");
        expect(host.settings.readingMotion).toEqual({ open: "instant", chapter: "leaf" });

        const chapter = renderRow(group.items[1]);
        expect(chapter.options.map(([key]) => key)).toEqual(["leaf", "flow", "stack"]);
        await chapter.pick("stack");
        expect(host.settings.readingMotion).toEqual({ open: "instant", chapter: "stack" });
        expect(host.saveSettings).toHaveBeenCalledTimes(2);
    });

    it("pauses at chapter ends until you turn it off, the value the Type panel and the leaf write too (#755 FR-8)", async () => {
        const host = plugin();
        const group = readingSettingsGroup(host as never) as { items: SettingGroupItem[] };
        const item = group.items.find((entry) => (entry as { name?: string }).name === "Pause at chapter ends") as SettingGroupItem;
        expect(item).toBeDefined();
        let value: boolean | null = null;
        let change: ((value: boolean) => unknown) | null = null;
        const toggle = {
            setValue(next: boolean) {
                value = next;
                return toggle;
            },
            onChange(cb: (value: boolean) => unknown) {
                change = cb;
                return toggle;
            },
        };
        const draw = () => (item as { render: (s: unknown) => void }).render({ addToggle: (cb: (t: unknown) => void) => cb(toggle) });
        draw();
        expect(value).toBe(true);
        await change!(false);
        expect((host.settings.readerPrefs as { chapterPause?: boolean }).chapterPause).toBe(false);
        // Written through the prefs' own reading: everything else the Type panel keeps is kept.
        expect(host.settings.readerPrefs).toMatchObject({ font: "sans", size: "medium", theme: "auto", timeLeft: true });
        expect(host.saveSettings).toHaveBeenCalledTimes(1);
        // Off stays off when the row is drawn again.
        draw();
        expect(value).toBe(false);
    });

    it("speaks both languages", () => {
        const keys = [
            "settings_section_reading",
            "settings_section_reading_purpose",
            "settings_reading_open_name",
            "settings_reading_open_desc",
            "settings_reading_open_shot",
            "settings_reading_open_instant",
            "settings_reading_chapter_name",
            "settings_reading_chapter_desc",
            "settings_reading_chapter_leaf",
            "settings_reading_chapter_flow",
            "settings_reading_chapter_stack",
            "settings_reading_pause_name",
            "settings_reading_pause_desc",
        ];
        for (const locale of [en, es] as unknown as Record<string, string>[]) {
            for (const key of keys) expect(locale[key]?.length).toBeGreaterThan(0);
        }
    });
});

import type { SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { t } from "architecture/lang";
import {
    CHAPTER_MOTIONS,
    OPEN_MOTIONS,
    readingMotion,
    type ChapterMotion,
    type OpenMotion,
    type ReadingMotion,
} from "architecture/components/core/reader/readingMotion";

type LocaleKey = Parameters<typeof t>[0];

const OPEN_LABEL: Record<OpenMotion, LocaleKey> = {
    shot: "settings_reading_open_shot",
    instant: "settings_reading_open_instant",
};

const CHAPTER_LABEL: Record<ChapterMotion, LocaleKey> = {
    leaf: "settings_reading_chapter_leaf",
    flow: "settings_reading_chapter_flow",
    stack: "settings_reading_chapter_stack",
};

/**
 * **Reading** (#732, epic #729): how a book opens from the Library and how one chapter gives way to
 * the next. Reduced motion still wins over both — the section's purpose line says so.
 */
export function readingSettingsGroup(plugin: Pick<ZettelFlow, "settings" | "saveSettings">): SettingDefinitionItem {
    const save = async (change: Partial<ReadingMotion>) => {
        plugin.settings.readingMotion = { ...readingMotion(plugin.settings.readingMotion), ...change };
        await plugin.saveSettings();
    };
    return {
        type: "group",
        items: [
            {
                name: t("settings_reading_open_name"),
                desc: t("settings_reading_open_desc"),
                render: (setting) => {
                    setting.addDropdown((dropdown) => {
                        for (const motion of OPEN_MOTIONS) dropdown.addOption(motion, t(OPEN_LABEL[motion]));
                        dropdown.setValue(readingMotion(plugin.settings.readingMotion).open);
                        dropdown.onChange((value) => save({ open: value as OpenMotion }));
                    });
                },
            },
            {
                name: t("settings_reading_chapter_name"),
                desc: t("settings_reading_chapter_desc"),
                render: (setting) => {
                    setting.addDropdown((dropdown) => {
                        for (const motion of CHAPTER_MOTIONS) dropdown.addOption(motion, t(CHAPTER_LABEL[motion]));
                        dropdown.setValue(readingMotion(plugin.settings.readingMotion).chapter);
                        dropdown.onChange((value) => save({ chapter: value as ChapterMotion }));
                    });
                },
            },
        ],
    };
}

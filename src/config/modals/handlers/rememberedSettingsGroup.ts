import type { SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { journalSettingsTile } from "./journalSettingsGroup";
import { judgementSettingsTile } from "./judgementSettingsGroup";
import { timelineSettingsTile } from "./timelineSettingsGroup";

/**
 * **What ZettelFlow remembers — local only** (#662, epic #659). The three records that used to be
 * three groups whose headings were lost in a flat run of rows: the development journal, the
 * decisions you make, and the idea snapshots. One card, three tiles, each with its own switch and a
 * line that says plainly what is kept. Nothing about what they do changed (F3).
 */
export function rememberedSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_card_remembers"),
        cls: c("settings-tiles"),
        items: [journalSettingsTile(plugin), judgementSettingsTile(plugin), timelineSettingsTile(plugin)],
    };
}

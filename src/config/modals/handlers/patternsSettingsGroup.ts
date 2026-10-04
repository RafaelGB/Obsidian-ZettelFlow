import type { SettingGroupItem } from "obsidian";
import type ZettelFlow from "main";
import { t } from "architecture/lang";

/**
 * The post-index re-run of a note's on-creation pattern (#200), on by default. A row of the
 * *Returns and the thinking space* card since #662 — it had a heading of its own for one toggle.
 */
export function patternsSettingsItem(plugin: ZettelFlow): SettingGroupItem {
    return {
        name: t("settings_patterns_enable_name"),
        desc: t("settings_patterns_enable_desc"),
        render: (setting) => {
            setting.addToggle((toggle) =>
                toggle.setValue(plugin.settings.patterns?.rerunOnIndex ?? true).onChange(async (value) => {
                    plugin.settings.patterns = { ...plugin.settings.patterns, rerunOnIndex: value };
                    await plugin.saveSettings();
                })
            );
        },
    };
}

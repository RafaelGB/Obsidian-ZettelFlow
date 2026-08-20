import { SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { t } from "architecture/lang";

/**
 * Declarative "Knowledge patterns" settings group (#200): a single toggle for the post-index re-run
 * of a note's on-creation pattern (on by default). Mirrors the declarative shape of the #162 journal
 * and #168 timeline groups — no raw DOM, no inline styles.
 */
export function patternsSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_patterns_heading"),
        items: [
            {
                name: t("settings_patterns_enable_name"),
                desc: t("settings_patterns_enable_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.patterns?.rerunOnIndex ?? true)
                            .onChange(async (value) => {
                                plugin.settings.patterns = { ...plugin.settings.patterns, rerunOnIndex: value };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
        ],
    };
}

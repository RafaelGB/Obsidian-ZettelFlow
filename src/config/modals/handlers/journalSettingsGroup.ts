import { SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";

/**
 * Declarative "Thinking journal" settings group (#162): an enable toggle for the development-event
 * journal (on by default) plus a data-disclosure note (local day→count only, no content, no network).
 * Mirrors the declarative shape of the #156 AI group.
 */
export function journalSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_journal_heading"),
        items: [
            {
                name: t("settings_journal_intro"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
            {
                name: t("settings_journal_enable_name"),
                desc: t("settings_journal_enable_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.journal.enabled)
                            .onChange(async (value) => {
                                plugin.settings.journal = { ...plugin.settings.journal, enabled: value };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_journal_disclosure"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
        ],
    };
}

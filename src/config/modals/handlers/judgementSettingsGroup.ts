import { SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";

/**
 * Declarative "Judgement record" settings group (#336, epic #335): an enable toggle for the
 * cognitive-agency record (on by default) plus a data-disclosure note — a local, bounded log of
 * locale-free descriptors, never note content and never model output. Mirrors the #162 journal group.
 */
export function judgementSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_judgements_heading"),
        items: [
            {
                name: t("settings_judgements_intro"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
            {
                name: t("settings_judgements_enable_name"),
                desc: t("settings_judgements_enable_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.judgements.enabled)
                            .onChange(async (value) => {
                                plugin.settings.judgements = { ...plugin.settings.judgements, enabled: value };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_judgements_disclosure"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
        ],
    };
}

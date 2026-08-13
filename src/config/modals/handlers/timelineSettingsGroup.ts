import { SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";

/**
 * Declarative "Evolution timeline" settings group (#168): an enable toggle for the conceptual
 * snapshot recorder (on by default) plus a data-disclosure note (local per-note state + claim text,
 * bounded, pruned on delete, no network). Mirrors the #162 journal group.
 */
export function timelineSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_timeline_heading"),
        items: [
            {
                name: t("settings_timeline_intro"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
            {
                name: t("settings_timeline_enable_name"),
                desc: t("settings_timeline_enable_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.timeline.enabled)
                            .onChange(async (value) => {
                                // Turning it off clears the stored snapshots — opting out erases the content store.
                                plugin.settings.timeline = {
                                    enabled: value,
                                    snapshots: value ? plugin.settings.timeline.snapshots : {},
                                };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_timeline_disclosure"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
        ],
    };
}

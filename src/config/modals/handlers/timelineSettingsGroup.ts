import type { SettingGroupItem } from "obsidian";
import type ZettelFlow from "main";
import { t } from "architecture/lang";
import { asTile } from "./settingsTile";

/**
 * The idea snapshots (#168) as a tile of *What ZettelFlow remembers* (#662): an enable toggle — off
 * by default, because it stores claim texts — and the lock line. Turning it off still clears what was
 * captured: opting out erases the content store.
 */
export function timelineSettingsTile(plugin: ZettelFlow): SettingGroupItem {
    return {
        name: t("settings_timeline_enable_name"),
        desc: t("settings_timeline_enable_desc"),
        render: (setting) => {
            asTile(setting, "settings_timeline_disclosure");
            setting.addToggle((toggle) =>
                toggle.setValue(plugin.settings.timeline.enabled).onChange(async (value) => {
                    plugin.settings.timeline = {
                        enabled: value,
                        snapshots: value ? plugin.settings.timeline.snapshots : {},
                    };
                    await plugin.saveSettings();
                })
            );
        },
    };
}

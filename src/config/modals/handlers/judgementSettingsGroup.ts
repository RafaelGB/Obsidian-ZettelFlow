import type { SettingGroupItem } from "obsidian";
import type ZettelFlow from "main";
import { t } from "architecture/lang";
import { asTile } from "./settingsTile";

/**
 * The judgement record (#336, epic #335) as a tile of *What ZettelFlow remembers* (#662): an enable
 * toggle (on by default) and the lock line — a local, bounded log of locale-free descriptors, never
 * note content and never model output. Its description names what turning it off costs (#534).
 */
export function judgementSettingsTile(plugin: ZettelFlow): SettingGroupItem {
    return {
        name: t("settings_judgements_enable_name"),
        desc: t("settings_judgements_enable_desc"),
        render: (setting) => {
            asTile(setting, "settings_judgements_disclosure");
            setting.addToggle((toggle) =>
                toggle.setValue(plugin.settings.judgements.enabled).onChange(async (value) => {
                    plugin.settings.judgements = { ...plugin.settings.judgements, enabled: value };
                    await plugin.saveSettings();
                })
            );
        },
    };
}

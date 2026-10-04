import type { SettingGroupItem } from "obsidian";
import type ZettelFlow from "main";
import { t } from "architecture/lang";
import { asTile } from "./settingsTile";

/**
 * The development journal (#162) as a tile of *What ZettelFlow remembers* (#662): an enable toggle
 * (on by default) and the lock line — local day → count only, no content, no network.
 */
export function journalSettingsTile(plugin: ZettelFlow): SettingGroupItem {
    return {
        name: t("settings_journal_enable_name"),
        desc: t("settings_journal_enable_desc"),
        render: (setting) => {
            asTile(setting, "settings_journal_disclosure");
            setting.addToggle((toggle) =>
                toggle.setValue(plugin.settings.journal.enabled).onChange(async (value) => {
                    plugin.settings.journal = { ...plugin.settings.journal, enabled: value };
                    await plugin.saveSettings();
                })
            );
        },
    };
}

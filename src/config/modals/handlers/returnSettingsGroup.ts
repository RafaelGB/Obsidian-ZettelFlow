import { SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import {
    DEFAULT_RETURN_INTERVAL_DAYS,
    RETURN_INTERVAL_MAX_DAYS,
    RETURN_INTERVAL_MIN_DAYS,
} from "architecture/knowledge/review/dueClaims";

/**
 * Declarative "coming back" settings (#563, epic #558): the one duration behind a claim returning.
 *
 * §XIII — the `Setting` ships in the same change as the field it writes. And it is **one** setting
 * on purpose: no per-claim schedule, no adaptive interval, no ease factor. A per-claim schedule
 * would be a second configuration surface for a feature whose whole value is that it asks nothing
 * of you.
 *
 * Mirrors `timelineSettingsGroup`: an intro row, the control, and a disclosure row saying plainly
 * what this does and does not do.
 */
export function returnSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_return_heading"),
        items: [
            {
                name: t("settings_return_intro"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
            {
                name: t("settings_return_interval_name"),
                desc: t("settings_return_interval_desc"),
                render: (setting) => {
                    setting.addSlider((slider) =>
                        slider
                            .setLimits(RETURN_INTERVAL_MIN_DAYS, RETURN_INTERVAL_MAX_DAYS, 1)
                            .setValue(plugin.settings.returnIntervalDays ?? DEFAULT_RETURN_INTERVAL_DAYS)
                            .onChange(async (value) => {
                                plugin.settings.returnIntervalDays = value;
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_return_disclosure"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
        ],
    };
}

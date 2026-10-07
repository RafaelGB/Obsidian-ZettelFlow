import type { Setting, SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { daysLabel } from "./durationLabel";
import { addFolderField } from "./folderField";
import { controlContainer } from "architecture/components/settings/settingContainer";
import { DEFAULT_SETTINGS } from "config/typing";
import {
    DEFAULT_RETURN_INTERVAL_DAYS,
    RETURN_INTERVAL_MAX_DAYS,
    RETURN_INTERVAL_MIN_DAYS,
} from "architecture/knowledge/review/dueClaims";
import { patternsSettingsItem } from "./patternsSettingsGroup";

/**
 * **Returns and the thinking space** (#662, epic #659): how long a claim stands before it comes
 * back, where thinking lives, and the pattern that finishes after indexing.
 *
 * The return is **one** setting on purpose (#563): no per-claim schedule, no adaptive interval, no
 * ease factor. Its description now carries what the old intro and disclosure rows said — a duration
 * you set, that never adapts and never reminds you — and the slider says the number it stands for.
 */
export function returnSettingsGroup(plugin: ZettelFlow, changed: () => void = () => undefined): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_card_returns"),
        items: [
            {
                name: t("settings_return_interval_name"),
                desc: t("settings_return_interval_desc"),
                render: (setting: Setting) => {
                    const initial = plugin.settings.returnIntervalDays ?? DEFAULT_RETURN_INTERVAL_DAYS;
                    let label: HTMLElement | null = null;
                    const show = (days: number) => label?.setText(daysLabel(days));
                    setting.addSlider((slider) => {
                        slider
                            .setLimits(RETURN_INTERVAL_MIN_DAYS, RETURN_INTERVAL_MAX_DAYS, 1)
                            .setValue(initial)
                            .onChange(async (value) => {
                                show(value);
                                plugin.settings.returnIntervalDays = value;
                                await plugin.saveSettings();
                            });
                        // Live while dragging: onChange may fire only on release.
                        slider.sliderEl?.addEventListener("input", () => show(Number(slider.getValue())));
                    });
                    label = controlContainer(setting, "settings-slider-value");
                    show(initial);
                },
            },
            {
                // The Thought Lab (#466). Its folder is excluded from the knowledge model by the same
                // scope that hides ZettelFlow's own folders, so nothing you write here is ever an
                // orphan, debt, or a line in Health.
                name: t("settings_thought_lab_name"),
                desc: t("settings_thought_lab_desc"),
                render: (setting: Setting) => {
                    // Room for a whole path: the default control column showed "4. 📒" of a nested one.
                    setting.settingEl.addClass(c("settings-folder-wide"));
                    addFolderField(setting, {
                        read: () => plugin.settings.thoughtLabPath ?? "",
                        accept: (value) => {
                            plugin.settings.thoughtLabPath = value;
                            return true;
                        },
                        saved: async () => {
                            changed();
                            await plugin.saveSettings();
                        },
                        // The real default, not a folder that never existed (#662).
                        placeholder: DEFAULT_SETTINGS.thoughtLabPath ?? "",
                    });
                },
            },
            patternsSettingsItem(plugin),
        ],
    };
}

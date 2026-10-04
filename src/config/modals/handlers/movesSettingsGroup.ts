import type { Setting, SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { ALL_CULTIVATION_MOVES } from "architecture/knowledge/state";
import { descContainer } from "architecture/components/settings/settingContainer";
import { asTile } from "./settingsTile";

type LocaleKey = Parameters<typeof t>[0];

/** "3 of 5 are on" — how many moves a thinking session offers, said above the grid (#662). */
export function movesCountLabel(on: number, total: number = ALL_CULTIVATION_MOVES.length): string {
    return tCount(on, "settings_moves_count", String(on), String(total));
}

/**
 * **Cultivate moves** (#662, epic #659): the five moves a thinking session offers, as a grid of tiles
 * — each its own declarative row with a switch, so Obsidian's settings search still finds "Challenge"
 * — with the count of how many are on said above them and kept current as you flip one.
 */
export function movesSettingsGroup(plugin: ZettelFlow, changed: () => void = () => undefined): SettingDefinitionItem {
    let count: HTMLElement | null = null;
    const current = () => plugin.settings.cultivateMoves ?? [...ALL_CULTIVATION_MOVES];
    const showCount = () => count?.setText(movesCountLabel(current().length));

    return {
        type: "group",
        heading: t("settings_card_moves"),
        cls: c("settings-tiles"),
        items: [
            {
                name: t("settings_cultivate_intro"),
                render: (setting: Setting) => {
                    setting.setClass(c("readable-setting-item"));
                    setting.settingEl.addClass(c("settings-span-all"));
                    count = descContainer(setting, "settings-moves-count");
                    showCount();
                },
            },
            ...ALL_CULTIVATION_MOVES.map((kind) => ({
                name: t(`cultivate_move_${kind}_title` as LocaleKey),
                desc: t(`cultivate_move_${kind}_desc` as LocaleKey),
                render: (setting: Setting) => {
                    asTile(setting);
                    setting.addToggle((toggle) =>
                        toggle.setValue(current().includes(kind)).onChange(async (value) => {
                            const base = current();
                            const next = value ? [...new Set([...base, kind])] : base.filter((m) => m !== kind);
                            // Keep the canonical order so the session reads predictably.
                            plugin.settings.cultivateMoves = ALL_CULTIVATION_MOVES.filter((m) => next.includes(m));
                            showCount();
                            changed();
                            await plugin.saveSettings();
                        })
                    );
                },
            })),
        ],
    };
}

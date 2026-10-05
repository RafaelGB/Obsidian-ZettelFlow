import { moment as obsidianMoment, type SettingDefinitionItem } from "obsidian";
import type MomentFn from "moment";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { controlContainer, descContainer } from "architecture/components/settings/settingContainer";
import { normalizeDensity, type WizardDensity } from "application/components/noteBuilder/presentation";

// Obsidian bundles moment and re-exports it as a namespace; cast to the callable signature.
const moment = obsidianMoment as unknown as typeof MomentFn;

/** A moment format, shown as the field's placeholder: a code, not prose, so it keeps its case. */
const PREFIX_EXAMPLE = "YYYYMMDDHHmm";

/** The two densities, in the order the segmented choice draws them. */
const DENSITIES: readonly WizardDensity[] = ["comfortable", "compact"];

/**
 * What a prefix pattern turns into right now (#661) — said as a sentence under the field, and
 * redrawn as you type, so the moment format reads as a result rather than as a code to decode.
 */
export function prefixPreviewText(pattern: string, format: (pattern: string) => string): string {
    const trimmed = pattern.trim();
    if (!trimmed) return t("settings_prefix_preview_empty");
    return t("settings_prefix_preview", format(trimmed));
}

/**
 * **Creating notes** (#661, epic #659): how the wizard behaves when it builds a note. Every row keeps
 * its setting key and its behaviour (F3); what changed is that the prefix shows what it produces and
 * the density is a choice you see both sides of.
 */
export function creatingSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        items: [
            {
                // Unfinished thinking deserves continuity (#410) — on by default.
                name: t("settings_wizard_drafts_name"),
                desc: t("settings_wizard_drafts_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle.setValue(plugin.settings.wizardDraftsEnabled ?? true).onChange(async (value) => {
                            plugin.settings.wizardDraftsEnabled = value;
                            await plugin.saveSettings();
                        })
                    );
                },
            },
            {
                name: t("create_in_current_folder_toggle_title"),
                desc: t("create_in_current_folder_toggle_description"),
                control: { type: "toggle", key: "createInCurrentFolder" },
            },
            {
                name: t("unique_prefix_pattern_title"),
                desc: t("unique_prefix_pattern_description"),
                render: (setting) => {
                    const preview = descContainer(setting, "settings-prefix-preview");
                    const show = (pattern: string) =>
                        preview.setText(prefixPreviewText(pattern, (format) => moment().format(format)));
                    show(plugin.settings.uniquePrefix ?? "");
                    setting.addText((text) =>
                        text
                            .setValue(plugin.settings.uniquePrefix)
                            .setPlaceholder(PREFIX_EXAMPLE)
                            .onChange(async (value) => {
                                plugin.settings.uniquePrefix = value;
                                show(value);
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                // Density of the creation wizard (#409). A preference about the reader's eyes, so it
                // is global rather than per flow — and with two options, both are shown (#661).
                name: t("settings_wizard_density_name"),
                desc: t("settings_wizard_density_desc"),
                render: (setting) => {
                    const group = controlContainer(setting, "settings-segment");
                    group.setAttribute("role", "group");
                    group.setAttribute("aria-label", t("settings_wizard_density_name"));
                    const buttons = DENSITIES.map((density) => {
                        const button = group.createEl("button", {
                            cls: c("settings-segment-option"),
                            text: t(density === "comfortable" ? "settings_wizard_density_comfortable" : "settings_wizard_density_compact"),
                            attr: { type: "button", "data-density": density },
                        });
                        button.addEventListener("click", () => {
                            plugin.settings.wizardDensity = density;
                            mark(density);
                            void plugin.saveSettings();
                        });
                        return button;
                    });
                    const mark = (current: WizardDensity) => {
                        for (const button of buttons) {
                            const on = button.getAttribute("data-density") === current;
                            button.toggleClass("is-active", on);
                            button.setAttribute("aria-pressed", String(on));
                        }
                    };
                    mark(normalizeDensity(plugin.settings.wizardDensity));
                },
            },
            {
                // Colour as meaning (#429). Off by default: the step editor offers the colour one click
                // at a time, and this makes it automatic for people who want the canvas to paint itself.
                name: t("settings_colour_by_phase_title"),
                desc: t("settings_colour_by_phase_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle.setValue(plugin.settings.colourNodesByPhase ?? false).onChange(async (value) => {
                            plugin.settings.colourNodesByPhase = value;
                            await plugin.saveSettings();
                        })
                    );
                },
            },
            {
                name: t("open_home_on_startup_toggle_title"),
                desc: t("open_home_on_startup_toggle_description"),
                control: { type: "toggle", key: "openHomeOnStartup" },
            },
        ],
    };
}

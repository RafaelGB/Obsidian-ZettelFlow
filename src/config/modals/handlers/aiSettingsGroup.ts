import { setIcon, type SettingDefinitionItem, type TextComponent } from "obsidian";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { DEFAULT_AI_MAX_INPUT_CHARS, DEFAULT_AI_MAX_OUTPUT_TOKENS } from "architecture/ai/aiGate";
import { rowContainer } from "architecture/components/settings/settingContainer";

/** Read a whole number from a field, or nothing — an empty field means "use the default". */
function wholeNumber(value: string): number | undefined {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The AI section (#156, then #663, epic #659): one master switch, and the provider only when it is
 * on. Endpoint, model, key and the two limits used to sit in the tab while AI was off — five fields
 * asking for things nobody had decided to use. They are declared `visible` on the switch now, and
 * the switch re-evaluates them in place (`refresh`, the tab's `refreshDomState`): a full `update()`
 * would re-run every row's render and stack copies of the dynamic lists.
 *
 * The privacy promise stays visible whatever the switch says, as a callout: it is the reason the
 * switch can be trusted.
 */
export function aiSettingsGroup(plugin: ZettelFlow, refresh: () => void): SettingDefinitionItem {
    const on = () => plugin.settings.ai.enabled === true;
    return {
        type: "group",
        cls: c("settings-ai-card"),
        items: [
            {
                name: t("settings_ai_enable_name"),
                desc: t("settings_ai_enable_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle.setValue(on()).onChange(async (value) => {
                            plugin.settings.ai = { ...plugin.settings.ai, enabled: value };
                            await plugin.saveSettings();
                            refresh();
                        })
                    );
                },
            },
            {
                name: t("settings_ai_endpoint_name"),
                desc: t("settings_ai_endpoint_desc"),
                visible: on,
                render: (setting) => {
                    setting.addText((text) => {
                        text.setPlaceholder(t("settings_ai_endpoint_placeholder"))
                            .setValue(plugin.settings.ai.endpoint)
                            .onChange(async (value) => {
                                plugin.settings.ai = { ...plugin.settings.ai, endpoint: value.trim() };
                                await plugin.saveSettings();
                            });
                        text.inputEl.addClass(c("settings-input-wide"));
                    });
                },
            },
            {
                name: t("settings_ai_model_name"),
                desc: t("settings_ai_model_desc"),
                visible: on,
                render: (setting) => {
                    setting.addText((text) =>
                        text
                            .setPlaceholder(t("settings_ai_model_placeholder"))
                            .setValue(plugin.settings.ai.model)
                            .onChange(async (value) => {
                                plugin.settings.ai = { ...plugin.settings.ai, model: value.trim() };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_ai_apikey_name"),
                desc: t("settings_ai_apikey_desc"),
                visible: on,
                render: (setting) => {
                    setting.addText((text) => {
                        text.setValue(plugin.settings.ai.apiKey).onChange(async (value) => {
                            plugin.settings.ai = { ...plugin.settings.ai, apiKey: value };
                            await plugin.saveSettings();
                        });
                        text.inputEl.type = "password";
                    });
                },
            },
            {
                // The two bounds were two rows; they answer one question — how much goes out, how
                // much comes back — so they share one (#663). The old names stay findable.
                name: t("settings_ai_limits_name"),
                desc: t("settings_ai_limits_desc"),
                aliases: [t("settings_ai_max_input_name"), t("settings_ai_max_output_name")],
                visible: on,
                render: (setting) => {
                    const limit = (
                        text: TextComponent,
                        value: number | undefined,
                        fallback: number,
                        label: string,
                        save: (parsed: number | undefined) => void
                    ) => {
                        text.setPlaceholder(String(fallback))
                            .setValue(String(value ?? fallback))
                            .onChange(async (raw) => {
                                save(wholeNumber(raw));
                                await plugin.saveSettings();
                            });
                        text.inputEl.type = "number";
                        text.inputEl.setAttribute("aria-label", label);
                        text.inputEl.addClass(c("settings-input-number"));
                    };
                    setting.addText((text) =>
                        limit(
                            text,
                            plugin.settings.ai.maxInputChars,
                            DEFAULT_AI_MAX_INPUT_CHARS,
                            t("settings_ai_max_input_name"),
                            (parsed) => (plugin.settings.ai = { ...plugin.settings.ai, maxInputChars: parsed })
                        )
                    );
                    setting.addText((text) =>
                        limit(
                            text,
                            plugin.settings.ai.maxOutputTokens,
                            DEFAULT_AI_MAX_OUTPUT_TOKENS,
                            t("settings_ai_max_output_name"),
                            (parsed) => (plugin.settings.ai = { ...plugin.settings.ai, maxOutputTokens: parsed })
                        )
                    );
                },
            },
            {
                // The promise, as a callout that is always there — it is why the switch is safe.
                name: t("settings_ai_privacy_name"),
                desc: t("settings_ai_disclosure"),
                render: (setting) => {
                    setting.settingEl.addClass(c("settings-callout"));
                    // A named container, so a second render reuses it; CSS puts it first in the row.
                    setIcon(rowContainer(setting, "settings-callout-icon"), "shield-check");
                },
            },
        ],
    };
}

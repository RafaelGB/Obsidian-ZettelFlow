import { SettingDefinitionItem } from "obsidian";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { DEFAULT_AI_MAX_INPUT_CHARS, DEFAULT_AI_MAX_OUTPUT_TOKENS } from "architecture/ai/aiGate";

/**
 * Declarative AI settings group (#156, FR-8/AC-3) for `ZettelFlowSettingsTab.getSettingDefinitions()`.
 * An off-by-default enable toggle plus bring-your-own endpoint / model / API-key fields, and a
 * visible data-disclosure note (what is sent, only-your-endpoint, key in data.json, no telemetry).
 * Mirrors the declarative shape of the `events` group.
 */
export function aiSettingsGroup(plugin: ZettelFlow): SettingDefinitionItem {
    return {
        type: "group",
        heading: t("settings_ai_heading"),
        items: [
            {
                name: t("settings_ai_intro"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
            {
                name: t("settings_ai_enable_name"),
                desc: t("settings_ai_enable_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.ai.enabled)
                            .onChange(async (value) => {
                                plugin.settings.ai = { ...plugin.settings.ai, enabled: value };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_ai_endpoint_name"),
                desc: t("settings_ai_endpoint_desc"),
                render: (setting) => {
                    setting.addText((text) =>
                        text
                            .setPlaceholder(t("settings_ai_endpoint_placeholder"))
                            .setValue(plugin.settings.ai.endpoint)
                            .onChange(async (value) => {
                                plugin.settings.ai = { ...plugin.settings.ai, endpoint: value.trim() };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_ai_model_name"),
                desc: t("settings_ai_model_desc"),
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
                render: (setting) => {
                    setting.addText((text) => {
                        text
                            .setValue(plugin.settings.ai.apiKey)
                            .onChange(async (value) => {
                                plugin.settings.ai = { ...plugin.settings.ai, apiKey: value };
                                await plugin.saveSettings();
                            });
                        text.inputEl.type = "password";
                    });
                },
            },
            {
                name: t("settings_ai_automations_name"),
                desc: t("settings_ai_automations_desc"),
                render: (setting) => {
                    setting.addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.ai.allowInAutomations ?? false)
                            .onChange(async (value) => {
                                plugin.settings.ai = { ...plugin.settings.ai, allowInAutomations: value };
                                await plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: t("settings_ai_max_input_name"),
                desc: t("settings_ai_max_input_desc"),
                render: (setting) => {
                    setting.addText((text) => {
                        text
                            .setPlaceholder(String(DEFAULT_AI_MAX_INPUT_CHARS))
                            .setValue(String(plugin.settings.ai.maxInputChars ?? DEFAULT_AI_MAX_INPUT_CHARS))
                            .onChange(async (value) => {
                                const parsed = Number.parseInt(value, 10);
                                plugin.settings.ai = {
                                    ...plugin.settings.ai,
                                    maxInputChars: Number.isFinite(parsed) ? parsed : undefined,
                                };
                                await plugin.saveSettings();
                            });
                        text.inputEl.type = "number";
                    });
                },
            },
            {
                name: t("settings_ai_max_output_name"),
                desc: t("settings_ai_max_output_desc"),
                render: (setting) => {
                    setting.addText((text) => {
                        text
                            .setPlaceholder(String(DEFAULT_AI_MAX_OUTPUT_TOKENS))
                            .setValue(String(plugin.settings.ai.maxOutputTokens ?? DEFAULT_AI_MAX_OUTPUT_TOKENS))
                            .onChange(async (value) => {
                                const parsed = Number.parseInt(value, 10);
                                plugin.settings.ai = {
                                    ...plugin.settings.ai,
                                    maxOutputTokens: Number.isFinite(parsed) ? parsed : undefined,
                                };
                                await plugin.saveSettings();
                            });
                        text.inputEl.type = "number";
                    });
                },
            },
            {
                name: t("settings_ai_disclosure"),
                render: (setting) => {
                    setting.setClass(c("readable-setting-item"));
                },
            },
        ],
    };
}

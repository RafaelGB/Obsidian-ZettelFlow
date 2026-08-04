import ZettelFlow from "main";
import { moment as obsidianMoment, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { FileSuggest, FolderSuggest } from "architecture/settings";
import { FILE_EXTENSIONS, FileService } from "architecture/plugin";
import { DEFAULT_SETTINGS } from "config";
import { CommunityTemplatesModal, ManageInstalledTemplatesModal } from "application/community";
import { createRoot } from "react-dom/client";
import React from "react";
import { PropertyHooksManager } from "./handlers/hooks/components/PropertyHooksManager";

// Obsidian bundles moment and re-exports it as a namespace; cast to the callable signature.
const moment = obsidianMoment as unknown as typeof MomentFn;

export class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettelFlow;

    constructor(plugin: ZettelFlow) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        const plugin = this.plugin;
        return [
            // ── General ──────────────────────────────────────────────────────
            {
                type: "group",
                items: [
                    {
                        name: t("support_coffee_button"),
                        action: () => {
                            window.open("https://www.buymeacoffee.com/5tsytn22v9Z", "_blank");
                        },
                    },
                    {
                        name: t("community_templates_browser_title"),
                        desc: t("community_templates_browser_description"),
                        action: () => new CommunityTemplatesModal(plugin).open(),
                    },
                    {
                        name: t("manage_installed_templates_title"),
                        desc: t("manage_installed_templates_description"),
                        action: () => new ManageInstalledTemplatesModal(plugin).open(),
                    },
                    {
                        name: t("ribbon_canvas_file_selector_title"),
                        desc: t("ribbon_canvas_file_selector_description"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                            setting.addSearch((cb) => {
                                new FileSuggest(cb.inputEl, FileService.PATH_SEPARATOR)
                                    .setExtensions(FILE_EXTENSIONS.ONLY_CANVAS);
                                cb.setPlaceholder(t("canvas_file_selector_placeholder"))
                                    .setValue(plugin.settings.ribbonCanvas)
                                    .onChange(async (value) => {
                                        plugin.settings.ribbonCanvas = value;
                                        await plugin.saveSettings();
                                    });
                            });
                        },
                    },
                    {
                        name: t("editor_canvas_file_selector_title"),
                        desc: t("editor_canvas_file_selector_description"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                            setting.addSearch((cb) => {
                                new FileSuggest(cb.inputEl, FileService.PATH_SEPARATOR)
                                    .setExtensions(FILE_EXTENSIONS.ONLY_CANVAS);
                                cb.setPlaceholder(t("canvas_file_selector_placeholder"))
                                    .setValue(plugin.settings.editorCanvas)
                                    .onChange(async (value) => {
                                        plugin.settings.editorCanvas = value;
                                        await plugin.saveSettings();
                                    });
                            });
                        },
                    },
                    {
                        name: t("unique_prefix_toggle_title"),
                        desc: t("unique_prefix_toggle_description"),
                        control: { type: "toggle", key: "uniquePrefixEnabled" },
                    },
                    {
                        name: t("unique_prefix_pattern_title"),
                        desc: buildPrefixDescription(plugin.settings.uniquePrefix),
                        visible: () => plugin.settings.uniquePrefixEnabled,
                        render: (setting) => {
                            setting.addText((text) =>
                                text
                                    .setValue(plugin.settings.uniquePrefix)
                                    .setPlaceholder(
                                        DEFAULT_SETTINGS.uniquePrefix ?? ""
                                    )
                                    .onChange(async (value) => {
                                        plugin.settings.uniquePrefix = value;
                                        setting.setDesc(buildPrefixDescription(value));
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                    {
                        name: t("folders_flows_selector_title"),
                        desc: t("folders_flows_selector_description"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                            setting
                                .addSearch((cb) => {
                                    new FolderSuggest(cb.inputEl);
                                    cb.setPlaceholder(t("folders_flows_selector_placeholder"))
                                        .setValue(plugin.settings.foldersFlowsPath)
                                        .onChange(async (value) => {
                                            plugin.settings.foldersFlowsPath = value;
                                            await plugin.saveSettings();
                                        });
                                })
                                .addButton((btn) =>
                                    btn
                                        .setClass("mod-cta")
                                        .setButtonText(t("reset_to_default"))
                                        .setIcon("reset")
                                        .onClick(async () => {
                                            plugin.settings.foldersFlowsPath =
                                                DEFAULT_SETTINGS.foldersFlowsPath!;
                                            await plugin.saveSettings();
                                            this.update();
                                        })
                                );
                        },
                    },
                    {
                        name: t("scripts_folder_selector_title"),
                        desc: t("scripts_folder_selector_description"),
                        render: (setting) => {
                            setting.addSearch((cb) => {
                                new FolderSuggest(cb.inputEl);
                                cb.setPlaceholder(t("scripts_folder_selector_placeholder"))
                                    .setValue(plugin.settings.jsLibraryFolderPath)
                                    .onChange(async (value) => {
                                        plugin.settings.jsLibraryFolderPath = value;
                                        await plugin.saveSettings();
                                    });
                            });
                        },
                    },
                    {
                        name: t("markdown_templates_folder_title"),
                        desc: t("markdown_templates_folder_description"),
                        render: (setting) => {
                            setting.addSearch((cb) => {
                                new FolderSuggest(cb.inputEl);
                                cb.setPlaceholder(t("markdown_templates_folder_placeholder"))
                                    .setValue(
                                        plugin.settings.communitySettings
                                            .markdownTemplateFolder
                                    )
                                    .onChange(async (value) => {
                                        plugin.settings.communitySettings.markdownTemplateFolder =
                                            value;
                                        await plugin.saveSettings();
                                    });
                            });
                        },
                    },
                ],
            },
            // ── Hooks ─────────────────────────────────────────────────────────
            {
                type: "group",
                heading: t("hooks_section_title"),
                items: [
                    {
                        name: t("property_hooks_setting_title"),
                        desc: t("property_hooks_setting_description"),
                        render: (setting) => {
                            const container = setting.settingEl.createDiv({
                                cls: "property-hooks-container",
                            });
                            const root = createRoot(container);
                            root.render(<PropertyHooksManager plugin={plugin} />);
                            return () => root.unmount();
                        },
                    },
                    {
                        name: t("hooks_flows_selector_title"),
                        desc: t("hooks_flows_selector_description"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                            setting
                                .addSearch((cb) => {
                                    new FolderSuggest(cb.inputEl);
                                    cb.setPlaceholder(t("folders_flows_selector_placeholder"))
                                        .setValue(plugin.settings.hooks.folderFlowPath)
                                        .onChange(async (value) => {
                                            plugin.settings.hooks.folderFlowPath = value;
                                            await plugin.saveSettings();
                                        });
                                })
                                .addButton((btn) =>
                                    btn
                                        .setClass("mod-cta")
                                        .setButtonText(t("reset_to_default"))
                                        .setIcon("reset")
                                        .onClick(async () => {
                                            plugin.settings.hooks.folderFlowPath =
                                                DEFAULT_SETTINGS.hooks!.folderFlowPath;
                                            await plugin.saveSettings();
                                            this.update();
                                        })
                                );
                        },
                    },
                ],
            },
            // ── Developer ────────────────────────────────────────────────────
            {
                type: "group",
                heading: t("developer_section_title"),
                items: [
                    {
                        name: t("logger_toggle_title"),
                        desc: t("logger_toggle_description"),
                        control: { type: "toggle", key: "loggerEnabled" },
                    },
                    {
                        name: t("logger_level_title"),
                        desc: t("logger_level_description"),
                        visible: () => plugin.settings.loggerEnabled,
                        control: {
                            type: "dropdown",
                            key: "logLevel",
                            options: {
                                trace: "trace",
                                debug: "debug",
                                info: "info",
                                warn: "warn",
                                error: "error",
                            },
                        },
                    },
                    {
                        name: t("community_url_title"),
                        desc: t("community_url_description"),
                        render: (setting) => {
                            setting
                                .addText((text) =>
                                    text
                                        .setPlaceholder(t("community_url_placeholder"))
                                        .setValue(plugin.settings.communitySettings.url)
                                        .onChange(async (value) => {
                                            plugin.settings.communitySettings.url = value;
                                            await plugin.saveSettings();
                                        })
                                )
                                .addButton((btn) =>
                                    btn
                                        .setClass("mod-cta")
                                        .setButtonText(t("reset_to_default"))
                                        .setIcon("reset")
                                        .onClick(async () => {
                                            plugin.settings.communitySettings.url =
                                                DEFAULT_SETTINGS.communitySettings!.url!;
                                            await plugin.saveSettings();
                                            this.update();
                                        })
                                );
                        },
                    },
                ],
            },
        ];
    }

    override async setControlValue(key: string, value: unknown): Promise<void> {
        if (key === "loggerEnabled") log.setDebugMode(value as boolean);
        if (key === "logLevel") log.setLevelInfo(value as string);
        await super.setControlValue(key, value);
        if (key === "uniquePrefixEnabled" || key === "loggerEnabled") {
            this.refreshDomState();
        }
    }
}

function buildPrefixDescription(pattern: string): string {
    return `${t("unique_prefix_pattern_description")}\n${t("unique_prefix_pattern_helper")}: ${moment().format(pattern)}`;
}

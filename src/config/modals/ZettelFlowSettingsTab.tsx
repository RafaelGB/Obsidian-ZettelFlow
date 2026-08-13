import ZettelFlow from "main";
import { moment as obsidianMoment, Platform, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { FileSuggest, FolderSuggest } from "architecture/settings";
import { FILE_EXTENSIONS, FileService, activateSidebarView } from "architecture/plugin";
import { WorkflowEventEngine } from "architecture/plugin/events/WorkflowEventEngine";
import { EVENT_LABEL_KEY, isWiredEvent } from "architecture/plugin/events";
import { fnsManager } from "architecture/api";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    DEFAULT_STATE_PROPERTY,
    DEFAULT_CREATED_PROPERTY,
    DEFAULT_LAST_REVIEWED_PROPERTY,
    LifecycleStateSchema,
} from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import { DEFAULT_SETTINGS } from "config";
import { CommunityTemplatesModal, ManageInstalledTemplatesModal } from "application/community";
import { createRoot } from "react-dom/client";
import React from "react";
import { PropertyHooksManager } from "./handlers/hooks/components/PropertyHooksManager";
import { aiSettingsGroup } from "./handlers/aiSettingsGroup";
import { journalSettingsGroup } from "./handlers/journalSettingsGroup";
import { ThinkingHeatmapView } from "architecture/components/core/thinkingHeatmap/ThinkingHeatmapView";
import { DiscoveriesView } from "architecture/components/core/discoveries/DiscoveriesView";
import { KnowledgeMapView } from "architecture/components/core/knowledgeMap/KnowledgeMapView";
import { ConceptNavView } from "architecture/components/core/conceptNav/ConceptNavView";
import { OpenQuestionsView } from "architecture/components/core/openQuestions/OpenQuestionsView";
import { createExampleFlow } from "application/notes/onboardingService";
import { SlipboxHealthView } from "architecture/components/core/slipboxHealth/SlipboxHealthView";
import { ResurfaceView } from "architecture/components/core/resurface/ResurfaceView";
import { StarterFlowsModal } from "zettelkasten/modals/StarterFlowsModal";

// Obsidian bundles moment and re-exports it as a namespace; cast to the callable signature.
const moment = obsidianMoment as unknown as typeof MomentFn;

// Debounce the (expensive) index re-register + rebuild when the user edits the state property name.
let lifecycleRebuildTimer: number | undefined;

// Documentation base + per-feature pages surfaced from the Zettelkasten toolkit settings group.
const DOCS_BASE = "https://rafaelgb.github.io/Obsidian-ZettelFlow/";
const TOOLKIT_DOCS = {
    companion: `${DOCS_BASE}architecture/actions-and-note-builder/`,
    zettelId: `${DOCS_BASE}actions/ZettelId/`,
    health: `${DOCS_BASE}development/slipbox-health-dashboard/`,
    starter: `${DOCS_BASE}development/zettelkasten-starter-flows/`,
    moc: `${DOCS_BASE}development/moc-builder/`,
    resurface: `${DOCS_BASE}development/connection-resurfacing/`,
    atomicity: `${DOCS_BASE}development/atomicity-split/`,
    heatmap: `${DOCS_BASE}development/thinking-heatmap/`,
    discoveries: `${DOCS_BASE}development/morning-discovery/`,
    map: `${DOCS_BASE}development/living-knowledge-map/`,
    conceptNav: `${DOCS_BASE}development/concept-navigation/`,
    openQuestions: `${DOCS_BASE}development/open-questions/`,
} as const;

export class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettelFlow;

    constructor(plugin: ZettelFlow) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        const plugin = this.plugin;
        return [
            // ── Get started (shown only when no canvas is configured) ─────────
            {
                type: "group",
                heading: t("settings_get_started_title"),
                cls: c("get-started-group"),
                visible: () => !plugin.settings.ribbonCanvas,
                items: [
                    {
                        name: t("settings_get_started_description"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_get_started_button"))
                                    .setCta()
                                    .onClick(async () => {
                                        const path = await createExampleFlow(plugin);
                                        if (path) {
                                            this.update();
                                            await FileService.openFile(path);
                                        }
                                    })
                            );
                        },
                    },
                ],
            },
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
                        name: t("create_in_current_folder_toggle_title"),
                        desc: t("create_in_current_folder_toggle_description"),
                        control: { type: "toggle", key: "createInCurrentFolder" },
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
                                        // Rebuild the `zf` script API so it reads from the new folder.
                                        fnsManager.invalidateCache();
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
            // ── Knowledge lifecycle ───────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_lifecycle_heading"),
                items: [
                    {
                        name: t("settings_lifecycle_intro"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                        },
                    },
                    {
                        name: t("settings_state_property_name"),
                        desc: t("settings_state_property_desc"),
                        render: (setting) => {
                            setting.addText((text) =>
                                text
                                    .setPlaceholder(DEFAULT_STATE_PROPERTY)
                                    .setValue(plugin.settings.lifecycle.stateProperty)
                                    .onChange(async (value) => {
                                        const next = value.trim() || DEFAULT_STATE_PROPERTY;
                                        plugin.settings.lifecycle.stateProperty = next;
                                        await plugin.saveSettings();
                                        if (lifecycleRebuildTimer) {
                                            window.clearTimeout(lifecycleRebuildTimer);
                                        }
                                        // Re-register the schema and rebuild once typing settles.
                                        lifecycleRebuildTimer = window.setTimeout(() => {
                                            const index = KnowledgeIndex.getInstance();
                                            index.registerSchemas({
                                                state: new LifecycleStateSchema(
                                                    next,
                                                    buildLifecycleAliases()
                                                ),
                                            });
                                            index.build();
                                        }, 500);
                                    })
                            );
                        },
                    },
                    {
                        name: t("settings_created_property_name"),
                        desc: t("settings_created_property_desc"),
                        render: (setting) => {
                            setting.addText((text) =>
                                text
                                    .setPlaceholder(DEFAULT_CREATED_PROPERTY)
                                    .setValue(plugin.settings.lifecycle.createdProperty)
                                    .onChange(async (value) => {
                                        plugin.settings.lifecycle.createdProperty =
                                            value.trim() || DEFAULT_CREATED_PROPERTY;
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                    {
                        name: t("settings_last_reviewed_property_name"),
                        desc: t("settings_last_reviewed_property_desc"),
                        render: (setting) => {
                            setting.addText((text) =>
                                text
                                    .setPlaceholder(DEFAULT_LAST_REVIEWED_PROPERTY)
                                    .setValue(plugin.settings.lifecycle.lastReviewedProperty)
                                    .onChange(async (value) => {
                                        plugin.settings.lifecycle.lastReviewedProperty =
                                            value.trim() || DEFAULT_LAST_REVIEWED_PROPERTY;
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                ],
            },
            // ── Semantic relations ────────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_relations_heading"),
                items: [
                    {
                        name: t("settings_relations_intro"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                        },
                    },
                    {
                        name: t("settings_parse_inline_relations_name"),
                        desc: t("settings_parse_inline_relations_desc"),
                        render: (setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(
                                        plugin.settings.relations?.parseInlineRelations ??
                                            !Platform.isMobile
                                    )
                                    .onChange(async (value) => {
                                        plugin.settings.relations = { parseInlineRelations: value };
                                        await plugin.saveSettings();
                                        // Rebuild frontmatter edges, then re-enrich inline ones if on.
                                        const index = KnowledgeIndex.getInstance();
                                        index.build();
                                        if (value) void index.enrichInlineRelations();
                                    })
                            );
                        },
                    },
                ],
            },
            // ── Event-driven workflows (#150) ─────────────────────────────────
            {
                type: "group",
                heading: t("settings_events_heading"),
                items: [
                    {
                        name: t("settings_events_intro"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                        },
                    },
                    {
                        name: t("settings_events_enable_name"),
                        desc: t("settings_events_enable_desc"),
                        render: (setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(plugin.settings.events?.enabled ?? false)
                                    .onChange(async (value) => {
                                        plugin.settings.events = { enabled: value };
                                        await plugin.saveSettings();
                                        // Arm/disarm the listener set immediately — no reload needed.
                                        const engine = WorkflowEventEngine.getInstance();
                                        if (value) engine.arm();
                                        else engine.disarm();
                                    })
                            );
                        },
                    },
                    {
                        name: t("settings_events_bindings_heading"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                            const list = setting.settingEl.createDiv({
                                cls: c("event-bindings-list"),
                            });
                            const renderList = async () => {
                                list.empty();
                                const engine = WorkflowEventEngine.getInstance();
                                const bindings = await engine.scanTriggers();
                                if (!bindings.length) {
                                    new Setting(list).setName(
                                        t("settings_events_binding_list_empty")
                                    );
                                    return;
                                }
                                for (const binding of bindings) {
                                    const flowName =
                                        binding.flowPath.split(FileService.PATH_SEPARATOR).pop() ??
                                        binding.flowPath;
                                    const eventLabel = isWiredEvent(binding.event)
                                        ? t(EVENT_LABEL_KEY[binding.event])
                                        : binding.event;
                                    const row = new Setting(list)
                                        .setName(`${flowName} · ${eventLabel}`)
                                        .setDesc(binding.flowPath);
                                    if (binding.filePath) {
                                        row.addToggle((toggle) =>
                                            toggle
                                                .setTooltip(t("settings_events_binding_enabled_name"))
                                                .setValue(binding.enabled !== false)
                                                .onChange((value) =>
                                                    void engine.setTriggerEnabled(binding, value)
                                                )
                                        );
                                        row.addExtraButton((btn) =>
                                            btn
                                                .setIcon("trash")
                                                .setTooltip(
                                                    t("settings_events_binding_remove_tooltip")
                                                )
                                                .onClick(async () => {
                                                    await engine.removeTrigger(binding);
                                                    await renderList();
                                                })
                                        );
                                    } else {
                                        row.addExtraButton((btn) =>
                                            btn
                                                .setIcon("pencil")
                                                .setTooltip(
                                                    t("settings_events_binding_open_tooltip")
                                                )
                                                .onClick(() =>
                                                    void FileService.openFile(binding.flowPath)
                                                )
                                        );
                                    }
                                }
                            };
                            void renderList();
                        },
                    },
                ],
            },
            // ── AI (optional, off by default) ─────────────────────────────────
            aiSettingsGroup(plugin),
            // ── Thinking journal (#162) ───────────────────────────────────────
            journalSettingsGroup(plugin),
            // ── Zettelkasten toolkit ──────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_toolkit_heading"),
                cls: c("toolkit-group"),
                items: [
                    {
                        name: t("settings_toolkit_intro"),
                        render: (setting) => {
                            setting.setClass(c("toolkit-intro"));
                        },
                    },
                    // Launchers: open the sidebar views / modal without the command palette.
                    {
                        name: t("settings_toolkit_health_name"),
                        desc: t("settings_toolkit_health_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, SlipboxHealthView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.health);
                        },
                    },
                    {
                        name: t("settings_toolkit_resurface_name"),
                        desc: t("settings_toolkit_resurface_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, ResurfaceView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.resurface);
                        },
                    },
                    {
                        name: t("settings_toolkit_heatmap_name"),
                        desc: t("settings_toolkit_heatmap_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, ThinkingHeatmapView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.heatmap);
                        },
                    },
                    {
                        name: t("settings_toolkit_discoveries_name"),
                        desc: t("settings_toolkit_discoveries_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, DiscoveriesView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.discoveries);
                        },
                    },
                    {
                        name: t("settings_toolkit_map_name"),
                        desc: t("settings_toolkit_map_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, KnowledgeMapView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.map);
                        },
                    },
                    {
                        name: t("settings_toolkit_concept_nav_name"),
                        desc: t("settings_toolkit_concept_nav_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, ConceptNavView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.conceptNav);
                        },
                    },
                    {
                        name: t("settings_toolkit_open_questions_name"),
                        desc: t("settings_toolkit_open_questions_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_open_button"))
                                    .setCta()
                                    .onClick(() =>
                                        void activateSidebarView(plugin.app, OpenQuestionsView.NAME)
                                    )
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.openQuestions);
                        },
                    },
                    {
                        name: t("settings_toolkit_starter_name"),
                        desc: t("settings_toolkit_starter_desc"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("settings_toolkit_install_button"))
                                    .setCta()
                                    .onClick(() => new StarterFlowsModal(plugin.app).open())
                            );
                            addDocsButton(setting, TOOLKIT_DOCS.starter);
                        },
                    },
                    // Learn-more rows: features reached via the wizard / commands, doc link only.
                    {
                        name: t("settings_toolkit_companion_name"),
                        desc: t("settings_toolkit_companion_desc"),
                        render: (setting) => addDocsButton(setting, TOOLKIT_DOCS.companion),
                    },
                    {
                        name: t("settings_toolkit_zettelid_name"),
                        desc: t("settings_toolkit_zettelid_desc"),
                        render: (setting) => addDocsButton(setting, TOOLKIT_DOCS.zettelId),
                    },
                    {
                        name: t("settings_toolkit_moc_name"),
                        desc: t("settings_toolkit_moc_desc"),
                        render: (setting) => addDocsButton(setting, TOOLKIT_DOCS.moc),
                    },
                    {
                        name: t("settings_toolkit_atomicity_name"),
                        desc: t("settings_toolkit_atomicity_desc"),
                        render: (setting) => addDocsButton(setting, TOOLKIT_DOCS.atomicity),
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
                            setting.settingEl.addClass(c("property-hooks-setting-item"));
                            const container = setting.settingEl.createDiv({
                                cls: c("property-hooks-container"),
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

/** Adds an "open documentation" icon button that opens the given docs URL in the browser. */
function addDocsButton(setting: Setting, url: string): void {
    setting.addExtraButton((btn) =>
        btn
            .setIcon("help")
            .setTooltip(t("settings_toolkit_docs_tooltip"))
            .onClick(() => {
                window.open(url, "_blank");
            })
    );
}

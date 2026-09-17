import ZettelFlow from "main";
import { App, moment as obsidianMoment, Notice, Platform, PluginSettingTab, Setting, SettingDefinitionGroup, SettingDefinitionItem } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { FolderSuggest } from "architecture/settings";
import { fnsManager, writeTypeDeclarations } from "architecture/api";
import { KnowledgeIndex } from "architecture/knowledge";
import { ALL_CULTIVATION_MOVES } from "architecture/knowledge/state";
import { normalizeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { ModeHostView } from "architecture/components/core/surface/ModeHostView";
import { normalizeDensity } from "application/components/noteBuilder/presentation";
import {
    DEFAULT_STATE_PROPERTY,
    DEFAULT_CREATED_PROPERTY,
    DEFAULT_LAST_REVIEWED_PROPERTY,
    LifecycleStateSchema,
} from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import { DEFAULT_SETTINGS } from "config";
import { CommunityTemplatesModal } from "application/community";
import { createRoot } from "react-dom/client";
import React from "react";
import { PropertyHooksManager } from "./handlers/hooks/components/PropertyHooksManager";
import { HookErrorBoundary } from "./handlers/hooks/components/HookErrorBoundary";
import { aiSettingsGroup } from "./handlers/aiSettingsGroup";
import { journalSettingsGroup } from "./handlers/journalSettingsGroup";
import { judgementSettingsGroup } from "./handlers/judgementSettingsGroup";
import { timelineSettingsGroup } from "./handlers/timelineSettingsGroup";
import { patternsSettingsGroup } from "./handlers/patternsSettingsGroup";
import { LOG_LEVEL_OFF } from "config/settingsMigration";
import { flowsSettingsGroup } from "./handlers/flowsSettingsGroup";
import { settingsSummary } from "config/settingsSummary";

/** The items of a group definition — the union does not narrow itself at the call site. */
type SettingsRow = NonNullable<SettingDefinitionGroup["items"]>[number];

function itemsOf(definition: SettingDefinitionItem): SettingsRow[] {
    return "items" in definition ? ((definition.items ?? []) as SettingsRow[]) : [];
}

type LocaleKey = Parameters<typeof t>[0];

// Obsidian bundles moment and re-exports it as a namespace; cast to the callable signature.
const moment = obsidianMoment as unknown as typeof MomentFn;

// Debounce the (expensive) index re-register + rebuild when the user edits the state property name.
let lifecycleRebuildTimer: number | undefined;
// Debounce the index rebuild when the user edits the excluded-paths list (#311).
let scopeRebuildTimer: number | undefined;

/**
 * Refresh any open knowledge surface (Home / Cultivate / Timeline / Health, and the Graph) after a scope
 * change (#374), so an exclusion takes effect on-screen immediately — not only on the next vault event.
 */
function refreshKnowledgeSurfaces(app: App): void {
    for (const type of ["zettelflow-home", "zettelflow-graph"]) {
        app.workspace.getLeavesOfType(type).forEach((leaf) => {
            if (leaf.view instanceof ModeHostView) leaf.view.refresh();
        });
    }
}

export class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettelFlow;
    /** View state, not a setting: nobody should meet a log level on their first day (#440). */
    private showAdvanced = false;

    constructor(plugin: ZettelFlow) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        const plugin = this.plugin;
        return [
            // ── What is on right now (#440) ──────────────────────────────────
            {
                type: "group",
                items: [
                    {
                        name: t("settings_summary_name"),
                        render: (setting) => {
                            setting.setClass(c("settings-summary"));
                            const host = setting.settingEl.createDiv({ cls: c("settings-summary-list") });
                            for (const fact of settingsSummary(plugin.settings)) {
                                host.createDiv({
                                    cls: c("settings-summary-fact"),
                                    text: `${t(fact.labelKey as LocaleKey)}: ${fact.value}`,
                                });
                            }
                        },
                    },
                ],
            },
            // ── 1 · Your flows (#435): the canvases that have a role ──────────
            flowsSettingsGroup(plugin, () => this.update()),
            // ── Get started (shown only when no canvas is configured) ─────────
            {
                type: "group",
                heading: t("settings_get_started_title"),
                cls: c("get-started-group"),
                visible: () => !plugin.settings.ribbonCanvas,
                items: [
                    {
                        // A3 (#246): a beginner's first move is to install a ready-made system — the one
                        // adoption path — not to hand-build an example flow. Funnel to the Systems browser.
                        name: t("settings_get_started_description"),
                        render: (setting) => {
                            setting.addButton((btn) =>
                                btn
                                    .setButtonText(t("welcome_cta_browse"))
                                    .setCta()
                                    .onClick(() => new CommunityTemplatesModal(plugin).open())
                            );
                        },
                    },
                ],
            },
            // ── 2 · Creating notes ────────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_group_creating"),
                items: [
                    
                    {
                        // Unfinished thinking deserves continuity (#410) — on by default.
                        name: t("settings_wizard_drafts_name"),
                        desc: t("settings_wizard_drafts_desc"),
                        render: (setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(plugin.settings.wizardDraftsEnabled ?? true)
                                    .onChange(async (value) => {
                                        plugin.settings.wizardDraftsEnabled = value;
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                    {
                        // Deliberate friction in the wizard (#411) — off by default, on purpose.
                        name: t("settings_builder_friction_name"),
                        desc: t("settings_builder_friction_desc"),
                        render: (setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(plugin.settings.builderFriction ?? false)
                                    .onChange(async (value) => {
                                        plugin.settings.builderFriction = value;
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                    {
                        // Density of the creation wizard (#409). A preference about the reader's eyes,
                        // so it is global rather than per flow.
                        name: t("settings_wizard_density_name"),
                        desc: t("settings_wizard_density_desc"),
                        render: (setting) => {
                            setting.addDropdown((dropdown) =>
                                dropdown
                                    .addOption("comfortable", t("settings_wizard_density_comfortable"))
                                    .addOption("compact", t("settings_wizard_density_compact"))
                                    .setValue(normalizeDensity(plugin.settings.wizardDensity))
                                    .onChange(async (value) => {
                                        plugin.settings.wizardDensity = normalizeDensity(value);
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                    {
                        // Colour as meaning (#429). Off by default: the step editor offers the
                        // colour one click at a time, and this makes it automatic for people who
                        // want the canvas to paint itself.
                        name: t("settings_colour_by_phase_title"),
                        desc: t("settings_colour_by_phase_desc"),
                        render: (setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(plugin.settings.colourNodesByPhase ?? false)
                                    .onChange(async (value) => {
                                        plugin.settings.colourNodesByPhase = value;
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
                        name: t("open_home_on_startup_toggle_title"),
                        desc: t("open_home_on_startup_toggle_description"),
                        control: { type: "toggle", key: "openHomeOnStartup" },
                    },
                    {
                        name: t("unique_prefix_pattern_title"),
                        desc: buildPrefixDescription(plugin.settings.uniquePrefix),
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
                    
                    
                    
                    
                
                ],
            },
            // ── 3 · Your vault's vocabulary ───────────────────────────────────
            {
                type: "group",
                heading: t("settings_group_vocabulary"),
                items: [
                    {
                        name: t("settings_scope_intro"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                        },
                    },
                    {
                        name: t("settings_excluded_paths_name"),
                        desc: t("settings_excluded_paths_desc"),
                        render: (setting) => {
                            // A folder-picker CRUD (#374): each row is one excluded folder, added from a
                            // vault-folder autosuggest so the stored value is the *exact* `folder.path` —
                            // no typo, case or emoji-encoding mismatch can silently make an exclusion no-op.
                            setting.setClass(c("excluded-paths-setting-item"));
                            const list = setting.settingEl.createDiv({ cls: c("excluded-paths-list") });
                            const draft = { value: "" };

                            const apply = async () => {
                                await plugin.saveSettings();
                                if (scopeRebuildTimer) window.clearTimeout(scopeRebuildTimer);
                                // Reindex once editing settles, then refresh open surfaces so the change shows now.
                                scopeRebuildTimer = window.setTimeout(() => {
                                    KnowledgeIndex.getInstance().build();
                                    refreshKnowledgeSurfaces(plugin.app);
                                }, 300);
                            };

                            const renderRows = () => {
                                list.empty();
                                const paths = plugin.settings.excludedPaths ?? [];
                                if (paths.length === 0) {
                                    list.createDiv({
                                        cls: c("excluded-paths-empty"),
                                        text: t("settings_excluded_paths_empty"),
                                    });
                                }
                                for (const path of paths) {
                                    new Setting(list)
                                        .setClass(c("excluded-paths-row"))
                                        .setName(path)
                                        .addExtraButton((btn) =>
                                            btn
                                                .setIcon("trash")
                                                .setTooltip(t("settings_excluded_paths_remove"))
                                                .onClick(async () => {
                                                    plugin.settings.excludedPaths = (plugin.settings.excludedPaths ?? []).filter(
                                                        (p) => p !== path
                                                    );
                                                    await apply();
                                                    renderRows();
                                                })
                                        );
                                }
                                new Setting(list)
                                    .setClass(c("excluded-paths-add"))
                                    .addSearch((cb) => {
                                        new FolderSuggest(cb.inputEl);
                                        cb.setPlaceholder(t("settings_excluded_paths_placeholder"))
                                            .setValue(draft.value)
                                            .onChange((value) => (draft.value = value));
                                    })
                                    .addButton((btn) =>
                                        btn
                                            .setButtonText(t("settings_excluded_paths_add"))
                                            .setCta()
                                            .onClick(async () => {
                                                if (draft.value.trim().length === 0) return;
                                                plugin.settings.excludedPaths = normalizeExcludedPaths([
                                                    ...(plugin.settings.excludedPaths ?? []),
                                                    draft.value,
                                                ]);
                                                draft.value = "";
                                                await apply();
                                                renderRows();
                                            })
                                    );
                            };
                            renderRows();
                        },
                    },
                
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
            // ── 4 · Thinking ──────────────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_group_thinking"),
                items: [
                    {
                        name: t("settings_cultivate_intro"),
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                        },
                    },
                    {
                        name: t("settings_cultivate_friction_name"),
                        desc: t("settings_cultivate_friction_desc"),
                        render: (setting: Setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(plugin.settings.cultivateFriction ?? true)
                                    .onChange(async (value) => {
                                        plugin.settings.cultivateFriction = value;
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                    ...ALL_CULTIVATION_MOVES.map((kind) => ({
                        name: t(`cultivate_move_${kind}_title` as Parameters<typeof t>[0]),
                        desc: t(`cultivate_move_${kind}_desc` as Parameters<typeof t>[0]),
                        render: (setting: Setting) => {
                            const current = plugin.settings.cultivateMoves ?? [...ALL_CULTIVATION_MOVES];
                            setting.addToggle((toggle) =>
                                toggle.setValue(current.includes(kind)).onChange(async (value) => {
                                    const base = plugin.settings.cultivateMoves ?? [...ALL_CULTIVATION_MOVES];
                                    const next = value ? [...new Set([...base, kind])] : base.filter((m) => m !== kind);
                                    // Keep the canonical order so the session reads predictably.
                                    plugin.settings.cultivateMoves = ALL_CULTIVATION_MOVES.filter((m) => next.includes(m));
                                    await plugin.saveSettings();
                                })
                            );
                        },
                    })),
                
                    ...itemsOf(journalSettingsGroup(plugin)),
                    ...itemsOf(judgementSettingsGroup(plugin)),
                    ...itemsOf(timelineSettingsGroup(plugin)),
                    ...itemsOf(patternsSettingsGroup(plugin)),
                ],
            },
            // ── 5 · AI (optional, off by default) ─────────────────────────────
            aiSettingsGroup(plugin),
            // ── 6 · Automation ────────────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_group_automation"),
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
                            root.render(
                                <HookErrorBoundary>
                                    <PropertyHooksManager plugin={plugin} />
                                </HookErrorBoundary>
                            );
                            // Defer unmount so React isn't torn down synchronously mid-commit if Obsidian
                            // tears the row down during an update (avoids "unmount while rendering").
                            return () => window.setTimeout(() => root.unmount(), 0);
                        },
                    },
                    
                
                ],
            },
            // ── 7 · Advanced, folded: nobody meets a log level on their first day
            {
                type: "group",
                items: [
                    {
                        name: t("settings_advanced_toggle"),
                        desc: t("settings_advanced_toggle_desc"),
                        render: (setting) => {
                            setting.addToggle((toggle) =>
                                toggle.setValue(this.showAdvanced).onChange((value) => {
                                    this.showAdvanced = value;
                                    this.update();
                                })
                            );
                        },
                    },
                ],
            },
            {
                type: "group",
                heading: t("settings_group_advanced"),
                visible: () => this.showAdvanced,
                items: [
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
                        name: t("generate_types_name"),
                        desc: t("generate_types_description"),
                        render: (setting) => {
                            setting.addButton((button) => {
                                button.setButtonText(t("generate_types_button")).onClick(async () => {
                                    const result = await writeTypeDeclarations();
                                    if (result.status === "written") {
                                        new Notice(t("generate_types_written", result.path));
                                    } else if (result.status === "no-folder") {
                                        new Notice(t("generate_types_no_folder"));
                                    } else {
                                        new Notice(t("generate_types_failed", result.message));
                                    }
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
                    {
                        name: t("logger_level_title"),
                        desc: t("logger_level_description"),
                        control: {
                            type: "dropdown",
                            key: "logLevel",
                            options: {
                                off: t("logger_level_off"),
                                trace: "trace",
                                debug: "debug",
                                info: "info",
                                warn: "warn",
                                error: "error",
                            },
                        },
                    },
                
                ],
            },
            // ── 8 · About ─────────────────────────────────────────────────────
            {
                type: "group",
                heading: t("settings_group_about"),
                items: [
                    {
                        name: t("settings_about_version"),
                        desc: plugin.manifest.version,
                        render: (setting) => {
                            setting.setClass(c("readable-setting-item"));
                        },
                    },
                    {
                        name: t("settings_about_docs"),
                        action: () => window.open("https://rafaelgb.github.io/Obsidian-ZettelFlow/", "_blank"),
                    },
{
                        name: t("support_coffee_button"),
                        action: () => {
                            window.open("https://www.buymeacoffee.com/5tsytn22v9Z", "_blank");
                        },
                    },
                ],
            },
        ];
    }

    override async setControlValue(key: string, value: unknown): Promise<void> {
        // `off` is a level now (#439): one control decides both whether and how much.
        if (key === "logLevel") {
            log.setDebugMode(value !== LOG_LEVEL_OFF);
            log.setLevelInfo(value as string);
        }
        await super.setControlValue(key, value);
    }
}

function buildPrefixDescription(pattern: string): string {
    return `${t("unique_prefix_pattern_description")}\n${t("unique_prefix_pattern_helper")}: ${moment().format(pattern)}`;
}


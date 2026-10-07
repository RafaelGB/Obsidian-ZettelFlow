import { Platform, type SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { normalizeExcludedPaths, systemExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { compiledScopeOf } from "architecture/knowledge/scopeGate";
import { renderScopeCard, type ScopeCardDeps } from "./scope/scopeCard";
import { commitScope } from "./scope/scopeCommit";
import { ScopeRuleSheet } from "./scope/ScopeRuleSheet";
import { leftOutListRenderer } from "./scope/scopeLeftOutList";
import {
    DEFAULT_STATE_PROPERTY,
    DEFAULT_CREATED_PROPERTY,
    DEFAULT_LAST_REVIEWED_PROPERTY,
    LifecycleStateSchema,
} from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import { rowContainer } from "architecture/components/settings/settingContainer";

// Debounce the (expensive) index re-register + rebuild when the user edits the state property name.
let lifecycleRebuildTimer: number | undefined;

/** The kept-out card's view of the live app (#713). */
export function scopeCardDeps(plugin: ZettelFlow): ScopeCardDeps {
    return {
        rules: () => compiledScopeOf(plugin.settings).rules,
        compiled: () => compiledScopeOf(plugin.settings),
        facts: () => KnowledgeIndex.getInstance().scopeFacts(),
        system: () => ({
            folders: systemExcludedPaths(plugin.settings),
            thinking: normalizeExcludedPaths([plugin.settings.thoughtLabPath ?? ""])[0] ?? "",
        }),
        folderExists: (path) => plugin.app.vault.getFolderByPath(path) !== null,
        commit: (next) => commitScope(plugin, next),
        isPhone: Platform.isPhone,
        openSheet: (draw, dismissed) => {
            const sheet = new ScopeRuleSheet(plugin.app, draw, dismissed);
            sheet.open();
            return sheet;
        },
        leftOutList: leftOutListRenderer((path) => {
            const file = plugin.app.vault.getFileByPath(path);
            if (!file) return;
            // Settings live in a window of their own (1.14): leave them, and open the note in the workspace.
            (plugin.app as unknown as { setting?: { close(): void } }).setting?.close();
            void plugin.app.workspace.getLeaf(false).openFile(file);
        }),
    };
}

/**
 * **Your knowledge** (#662, epic #659): what counts as knowledge, and how ZettelFlow reads it. Three
 * cards — what is kept out, the lifecycle properties side by side, typed links. Every row keeps its
 * name, so Obsidian's settings search still finds it (F1); every setting keeps its key (F3).
 */
export function knowledgeSettingsGroups(plugin: ZettelFlow): SettingDefinitionItem[] {
    return [
        {
            type: "group",
            heading: t("settings_card_scope"),
            items: [
                {
                    // What is left out (#713): closed rules and exceptions, replacing the folder list.
                    // The old name stays an alias, so Obsidian's settings search still finds it (FR-21).
                    name: t("settings_scope_name"),
                    desc: t("settings_scope_desc"),
                    aliases: [t("settings_excluded_paths_name"), t("settings_scope_alias_excluded"), t("settings_scope_alias_left_out")],
                    render: (setting) => {
                        setting.setClass(c("scope-setting-item"));
                        renderScopeCard(rowContainer(setting, "scope-card-host"), scopeCardDeps(plugin));
                    },
                },
            ],
        },
        {
            // The three property names read as one decision, so they sit side by side (#662).
            type: "group",
            heading: t("settings_card_lifecycle"),
            cls: c("settings-fields"),
            items: [
                {
                    name: t("settings_lifecycle_intro"),
                    render: (setting) => {
                        setting.setClass(c("readable-setting-item"));
                        setting.settingEl.addClass(c("settings-span-all"));
                    },
                },
                {
                    name: t("settings_state_property_name"),
                    desc: t("settings_state_property_desc"),
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-field"));
                        setting.addText((text) =>
                            text
                                .setPlaceholder(DEFAULT_STATE_PROPERTY)
                                .setValue(plugin.settings.lifecycle.stateProperty)
                                .onChange(async (value) => {
                                    const next = value.trim() || DEFAULT_STATE_PROPERTY;
                                    plugin.settings.lifecycle.stateProperty = next;
                                    await plugin.saveSettings();
                                    if (lifecycleRebuildTimer) window.clearTimeout(lifecycleRebuildTimer);
                                    // Re-register the schema and rebuild once typing settles.
                                    lifecycleRebuildTimer = window.setTimeout(() => {
                                        const index = KnowledgeIndex.getInstance();
                                        index.registerSchemas({
                                            state: new LifecycleStateSchema(next, buildLifecycleAliases()),
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
                        setting.settingEl.addClass(c("settings-field"));
                        setting.addText((text) =>
                            text
                                .setPlaceholder(DEFAULT_CREATED_PROPERTY)
                                .setValue(plugin.settings.lifecycle.createdProperty)
                                .onChange(async (value) => {
                                    plugin.settings.lifecycle.createdProperty = value.trim() || DEFAULT_CREATED_PROPERTY;
                                    await plugin.saveSettings();
                                })
                        );
                    },
                },
                {
                    name: t("settings_last_reviewed_property_name"),
                    desc: t("settings_last_reviewed_property_desc"),
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-field"));
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
        {
            type: "group",
            heading: t("settings_card_relations"),
            items: [
                {
                    // The card's heading and this row say what it is; the intro row that restated
                    // both went (#662).
                    name: t("settings_parse_inline_relations_name"),
                    desc: t("settings_parse_inline_relations_desc"),
                    render: (setting) => {
                        setting.addToggle((toggle) =>
                            toggle
                                .setValue(plugin.settings.relations?.parseInlineRelations ?? !Platform.isMobile)
                                .onChange(async (value) => {
                                    plugin.settings.relations = { parseInlineRelations: value };
                                    await plugin.saveSettings();
                                    // Rebuild frontmatter edges, then re-enrich inline ones if on.
                                    const index = KnowledgeIndex.getInstance();
                                    index.build();
                                    index.setEnrichmentEnabled(value);
                                    if (value) void index.enrichInlineRelations();
                                })
                        );
                    },
                },
            ],
        },
    ];
}

import { Platform, Setting, setIcon, type App, type SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { FolderSuggest } from "architecture/settings";
import { KnowledgeIndex } from "architecture/knowledge";
import { normalizeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { ModeHostView } from "architecture/components/core/surface/ModeHostView";
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

/** What a folder chip and the add form do with the excluded-paths list — the one place it changes. */
export interface ExcludedPathsActions {
    remove(path: string): void;
    add(path: string): void;
}

/**
 * Excluded folders as chips (#662): each one a removable token, then a folder search to add one.
 * The stored value stays the exact `folder.path` the suggest returns (#374) — no typo can silently
 * turn an exclusion into a no-op.
 */
export function renderExcludedChips(host: HTMLElement, paths: readonly string[], actions: ExcludedPathsActions): void {
    host.empty();
    const chips = host.createDiv({ cls: c("settings-chips") });
    if (paths.length === 0) {
        chips.createDiv({ cls: c("excluded-paths-empty"), text: t("settings_excluded_paths_empty") });
    }
    for (const path of paths) {
        const chip = chips.createDiv({ cls: c("settings-chip"), attr: { title: path } });
        chip.createSpan({ cls: c("settings-chip-label"), text: path });
        const remove = chip.createEl("button", {
            cls: [c("settings-chip-remove"), "clickable-icon"].join(" "),
            attr: { type: "button", "aria-label": `${t("settings_excluded_paths_remove")}: ${path}` },
        });
        setIcon(remove, "x");
        remove.addEventListener("click", () => actions.remove(path));
    }

    const form = host.createDiv({ cls: c("settings-chip-add") });
    const draft = { value: "" };
    new Setting(form)
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
                .onClick(() => {
                    if (draft.value.trim().length === 0) return;
                    actions.add(draft.value);
                    draft.value = "";
                })
        );
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
                    // Said once (#662): an intro row repeated this description almost word for word.
                    name: t("settings_excluded_paths_name"),
                    desc: t("settings_excluded_paths_desc"),
                    render: (setting) => {
                        setting.setClass(c("excluded-paths-setting-item"));
                        const host = rowContainer(setting, "excluded-paths-list");
                        const apply = async () => {
                            await plugin.saveSettings();
                            if (scopeRebuildTimer) window.clearTimeout(scopeRebuildTimer);
                            // Reindex once editing settles, then refresh open surfaces so the change shows now.
                            scopeRebuildTimer = window.setTimeout(() => {
                                KnowledgeIndex.getInstance().build();
                                refreshKnowledgeSurfaces(plugin.app);
                            }, 300);
                        };
                        const draw = () =>
                            renderExcludedChips(host, plugin.settings.excludedPaths ?? [], {
                                remove: (path) => {
                                    plugin.settings.excludedPaths = (plugin.settings.excludedPaths ?? []).filter(
                                        (p) => p !== path
                                    );
                                    draw();
                                    void apply();
                                },
                                add: (path) => {
                                    plugin.settings.excludedPaths = normalizeExcludedPaths([
                                        ...(plugin.settings.excludedPaths ?? []),
                                        path,
                                    ]);
                                    draw();
                                    void apply();
                                },
                            });
                        draw();
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

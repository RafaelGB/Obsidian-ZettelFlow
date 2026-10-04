import ZettelFlow from "main";
import { Notice, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { FolderSuggest } from "architecture/settings";
import { fnsManager, writeTypeDeclarations } from "architecture/api";
import { DEFAULT_SETTINGS } from "config";
import { CommunityTemplatesModal } from "application/community";
import { createRoot } from "react-dom/client";
import React from "react";
import { PropertyHooksManager } from "./handlers/hooks/components/PropertyHooksManager";
import { HookErrorBoundary } from "./handlers/hooks/components/HookErrorBoundary";
import { aiSettingsGroup } from "./handlers/aiSettingsGroup";
import { speedSettingsItems } from "./handlers/speedSettingsItems";
import { returnSettingsGroup } from "./handlers/returnSettingsGroup";
import { knowledgeSettingsGroups } from "./handlers/knowledgeSettingsGroups";
import { movesSettingsGroup } from "./handlers/movesSettingsGroup";
import { rememberedSettingsGroup } from "./handlers/rememberedSettingsGroup";
import { LOG_LEVEL_OFF } from "config/settingsMigration";
import { flowsSettingsGroup, flowsWithRole } from "./handlers/flowsSettingsGroup";
import { creatingSettingsGroup } from "./handlers/creatingSettingsGroup";
import { settingsGlance } from "config/settingsSummary";
import {
    SETTINGS_SECTIONS,
    renderFooter,
    renderGlance,
    renderHeader,
    renderNav,
    renderSectionIcon,
    renderStart,
    scrollToSection,
    sectionClass,
    sectionInView,
    type SectionId,
} from "./settingsShell";
import { openCultivateFromSettings } from "./startActions";
import { hasRowContainer, rowContainer } from "architecture/components/settings";


export class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettelFlow;

    constructor(plugin: ZettelFlow) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        const plugin = this.plugin;
        const advanced = () => plugin.settings.showAdvancedSettings === true;
        return [
            // ── The shell (#660): who it is, what is on, how to start, where everything is ────────
            this.shellGroup(),

            // ── 1 · Flows: the canvases that have a role (#435) ──────────────────────────────────
            this.sectionHead("flows"),
            ...flowsSettingsGroup(plugin, () => this.update()),

            // ── 2 · Creating notes ────────────────────────────────────────────────────────────────
            this.sectionHead("creating"),
            creatingSettingsGroup(plugin),

            // ── 3 · Your knowledge: what counts, and how it is read ──────────────────────────────
            this.sectionHead("knowledge"),
            ...knowledgeSettingsGroups(plugin),

            // ── 4 · Thinking: one card per question, the sub-headings it had lost restored ────────
            this.sectionHead("thinking"),
            {
                // The three "your reading before theirs" pauses, which lived in two groups (#660).
                type: "group",
                heading: t("settings_card_pauses"),
                items: [
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
                        // The same idea as Cultivate's friction, one surface over (#576). Off by
                        // default: Explore's job is to answer, and the pause is offered rather
                        // than imposed. The control that turns it on lives in Explore itself —
                        // this row is for finding it again, not for discovering it (§XIII).
                        name: t("settings_explore_think_first_name"),
                        desc: t("settings_explore_think_first_desc"),
                        render: (setting: Setting) => {
                            setting.addToggle((toggle) =>
                                toggle
                                    .setValue(plugin.settings.exploreThinkFirst === true)
                                    .onChange(async (value) => {
                                        plugin.settings.exploreThinkFirst = value;
                                        await plugin.saveSettings();
                                    })
                            );
                        },
                    },
                ],
            },
            movesSettingsGroup(plugin),
            returnSettingsGroup(plugin),
            rememberedSettingsGroup(plugin),

            // ── 5 · AI (optional, off by default): the section head names it, so the group does not
            this.sectionHead("ai"),
            { ...aiSettingsGroup(plugin), heading: undefined } as SettingDefinitionItem,

            // ── 6 · Automation ────────────────────────────────────────────────────────────────────
            this.sectionHead("automation"),
            {
                type: "group",
                items: [
                    {
                        name: t("property_hooks_setting_title"),
                        desc: t("property_hooks_setting_description"),
                        render: (setting) => {
                            setting.settingEl.addClass(c("property-hooks-setting-item"));
                            // Already mounted: a repeated render must not start a second React root.
                            if (hasRowContainer(setting, "property-hooks-container")) return;
                            const container = rowContainer(setting, "property-hooks-container");
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

            // ── 7 · Advanced, folded: nobody meets a log level on their first day (#440) ──────────
            this.sectionHead("advanced"),
            {
                type: "group",
                heading: t("settings_card_folders"),
                visible: advanced,
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
            {
                type: "group",
                heading: t("settings_card_scripts_logging"),
                visible: advanced,
                items: [
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
                    // The timings from this vault, read-only (#645): what you look at when something
                    // feels slow — beside the log level, not on the Health surface.
                    ...speedSettingsItems(),
                ],
            },

            // ── The footer: version, docs, where to report a problem, support ────────────────────
            this.footerGroup(),
        ];
    }

    /** The shell's four rows: header, at a glance, the start card, and the section bar (#660). */
    private shellGroup(): SettingDefinitionItem {
        const plugin = this.plugin;
        return {
            type: "group",
            cls: c("settings-shell"),
            items: [
                {
                    name: t("settings_header_name"),
                    desc: t("settings_header_tagline"),
                    searchable: false,
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-shell-row"), c("settings-header-row"));
                        renderHeader(rowContainer(setting, "settings-header"), plugin.manifest.version);
                    },
                },
                {
                    name: t("settings_glance_name"),
                    searchable: false,
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-shell-row"), c("settings-glance-row"));
                        const others = flowsWithRole(plugin).filter((flow) => flow.role !== "create").length;
                        renderGlance(
                            rowContainer(setting, "settings-glance"),
                            settingsGlance(plugin.settings, { otherFlows: others }),
                            (id) => this.go(id)
                        );
                    },
                },
                {
                    // Only while nothing creates notes: three ways in, each doing what it says (#660).
                    name: t("settings_start_title"),
                    desc: t("settings_start_desc"),
                    visible: () => !plugin.settings.ribbonCanvas,
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-shell-row"), c("settings-start-row"));
                        renderStart(rowContainer(setting, "settings-start"), {
                            browseSystems: () => new CommunityTemplatesModal(plugin).open(),
                            chooseCanvas: () => this.chooseCanvas(),
                            openCultivate: () => openCultivateFromSettings(plugin.app),
                        });
                    },
                },
                {
                    name: t("settings_nav_label"),
                    searchable: false,
                    render: (setting) => this.placeNav(setting),
                },
            ],
        };
    }

    /** A section's head: its icon, title and one-line purpose (#660). Advanced also carries its fold. */
    private sectionHead(id: SectionId): SettingDefinitionItem {
        const plugin = this.plugin;
        const info = SETTINGS_SECTIONS.find((section) => section.id === id)!;
        return {
            type: "group",
            cls: c("settings-section-group"),
            items: [
                {
                    name: t(info.titleKey),
                    desc: t(info.purposeKey),
                    aliases: id === "advanced" ? [t("settings_advanced_toggle")] : undefined,
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-section-head"), sectionClass(id));
                        renderSectionIcon(rowContainer(setting, "settings-section-icon"), id);
                        if (id !== "advanced") return;
                        // Remembered across visits now (#660): it reset every time the tab opened.
                        setting.addToggle((toggle) =>
                            toggle.setValue(plugin.settings.showAdvancedSettings === true).onChange(async (value) => {
                                plugin.settings.showAdvancedSettings = value;
                                await plugin.saveSettings();
                                // Re-evaluate the `visible` predicates in place. `update()`
                                // would re-render the whole tab, and a re-render re-runs every
                                // `render` callback on rows Obsidian keeps — which stacked a
                                // second copy of every dynamic list on the panel.
                                this.refreshDomState();
                            })
                        );
                    },
                },
            ],
        };
    }

    /** One line at the end of the tab, replacing the three-row About group (#660). */
    private footerGroup(): SettingDefinitionItem {
        const plugin = this.plugin;
        return {
            type: "group",
            cls: c("settings-footer-group"),
            items: [
                {
                    name: t("settings_footer_name"),
                    aliases: [t("settings_footer_docs"), t("settings_footer_report"), t("settings_footer_support")],
                    render: (setting) => {
                        setting.settingEl.addClass(c("settings-shell-row"), c("settings-footer-row"));
                        renderFooter(rowContainer(setting, "settings-footer"), plugin.manifest.version);
                    },
                },
            ],
        };
    }

    /** The section bar's listeners, from the last time it was placed. */
    private navCleanup: (() => void) | null = null;
    private navEl: HTMLElement | null = null;

    /**
     * Put the section bar where `position: sticky` can work: a direct child of the tab's scrolling
     * container, right after the shell group. Sticky only holds inside its parent, and a row sits
     * inside a group that ends long before the sections do. If the container is not where we expect
     * it, the bar is drawn inside its own row instead — still useful, just not sticky.
     */
    private placeNav(setting: Setting): () => void {
        this.navCleanup?.();
        setting.settingEl.addClass(c("settings-shell-row"), c("settings-nav-row"));
        const container = this.containerEl;
        let top: HTMLElement | null = setting.settingEl;
        while (top && top.parentElement !== container) top = top.parentElement;

        let nav: HTMLElement;
        if (top) {
            setting.settingEl.addClass(c("settings-nav-anchor"));
            container.querySelector(`:scope > .${c("settings-nav")}`)?.remove();
            nav = createDiv({ cls: c("settings-nav") });
            top.after(nav);
        } else {
            nav = rowContainer(setting, "settings-nav");
        }
        this.navEl = nav;
        const mark = renderNav(nav, (id) => this.go(id));

        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                const origin = container.getBoundingClientRect().top;
                const heads = SETTINGS_SECTIONS.flatMap((section) => {
                    const head = container.querySelector<HTMLElement>(`.${sectionClass(section.id)}`);
                    return head ? [{ id: section.id, top: head.getBoundingClientRect().top - origin }] : [];
                });
                mark(sectionInView(heads, nav.offsetHeight + 16));
            });
        };
        container.addEventListener("scroll", onScroll, { passive: true });
        const cleanup = () => {
            container.removeEventListener("scroll", onScroll);
            if (frame) window.cancelAnimationFrame(frame);
            if (top) nav.remove();
            this.navCleanup = null;
        };
        this.navCleanup = cleanup;
        return cleanup;
    }

    /** Jump to a section: open Advanced first if that is where you are going. */
    private go(id: SectionId): void {
        if (id === "advanced" && this.plugin.settings.showAdvancedSettings !== true) {
            this.plugin.settings.showAdvancedSettings = true;
            void this.plugin.saveSettings();
            this.refreshDomState();
        }
        const reduced = activeWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        scrollToSection(this.containerEl, id, this.navEl?.offsetHeight ?? 0, !reduced);
    }

    /** The start card's second way in: to the row that gives a canvas its role, ready to type. */
    private chooseCanvas(): void {
        this.go("flows");
        window.setTimeout(() => {
            this.containerEl.querySelector<HTMLInputElement>(`.${c("settings-assign-row")} input`)?.focus();
        }, 300);
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


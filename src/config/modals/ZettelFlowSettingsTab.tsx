import ZettelFlow from "main";
import { PluginSettingTab, Setting, SettingDefinitionItem, type ToggleComponent } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { CommunityTemplatesModal } from "application/community";
import { createRoot } from "react-dom/client";
import React from "react";
import { PropertyHooksManager } from "./handlers/hooks/components/PropertyHooksManager";
import { HookErrorBoundary } from "./handlers/hooks/components/HookErrorBoundary";
import { aiSettingsGroup } from "./handlers/aiSettingsGroup";
import { foldersSettingsGroup, scriptsLoggingGroup } from "./handlers/advancedSettingsGroups";
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
    scrollToRow,
    sectionClass,
    sectionInView,
    barIsStuck,
    fitNav,
    type SectionId,
} from "./settingsShell";
import { openCultivateFromSettings } from "./startActions";
import { keptRoot } from "./keptRoot";
import { descContainer, rowContainer } from "architecture/components/settings/settingContainer";

/** The worked hook examples: what to show someone who has just read what a hook is for. */
const HOOK_EXAMPLES_URL = "https://rafaelgb.github.io/Obsidian-ZettelFlow/vault-hooks/property-hooks/examples/";


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
                                        this.refreshGlance();
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
            movesSettingsGroup(plugin, () => this.refreshGlance()),
            returnSettingsGroup(plugin, () => this.pointerRefresh?.()),
            rememberedSettingsGroup(plugin),

            // ── 5 · AI (optional, off by default): one switch, and the provider only when it is on ──
            this.sectionHead("ai"),
            aiSettingsGroup(plugin, () => this.changedInPlace()),

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
                            // One line of what a hook is for, and where the worked examples are (#663).
                            const examples = descContainer(setting, "property-hooks-examples");
                            examples.createEl("a", {
                                text: t("property_hooks_examples_link"),
                                href: HOOK_EXAMPLES_URL,
                            });
                            // One root for the life of this container, kept across `update()` (see
                            // keptRoot): the cleanup only schedules the unmount, the re-render cancels it.
                            return this.mountHooks(rowContainer(setting, "property-hooks-container"));
                        },
                    },
                ],
            },

            // ── 7 · Advanced, folded: nobody meets a log level on their first day (#440) ──────────
            this.sectionHead("advanced"),
            // Every folder the plugin keeps its files in, in one grid with a reset each (#663).
            foldersSettingsGroup(plugin, advanced, () => this.goToThinkingFolder(), (refresh) => {
                this.pointerRefresh = refresh;
            }),
            scriptsLoggingGroup(advanced),

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
                        this.glanceHost = rowContainer(setting, "settings-glance");
                        this.refreshGlance();
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
                        setting.addToggle((toggle) => {
                            // Kept, so opening Advanced from elsewhere moves this switch too (#659).
                            this.advancedToggle = toggle;
                            toggle.setValue(plugin.settings.showAdvancedSettings === true).onChange(async (value) => {
                                plugin.settings.showAdvancedSettings = value;
                                // Re-evaluate the `visible` predicates in place — before the save,
                                // so a jump into Advanced finds its rows already shown. `update()`
                                // would re-render the whole tab, and a re-render re-runs every
                                // `render` callback on rows Obsidian keeps — which stacked a
                                // second copy of every dynamic list on the panel.
                                this.changedInPlace();
                                await plugin.saveSettings();
                            });
                        });
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

    /** Where the glance cards draw, from the glance row's last render. */
    private glanceHost: HTMLElement | null = null;
    /**
     * The section bar, from its row's last render — always the live element. Not `navEl`: that is
     * the tab's own entry in Obsidian's settings sidebar, and overwriting it handed our bar to the
     * sidebar's `is-active` bookkeeping.
     */
    private sectionBarEl: HTMLElement | null = null;
    /** The Advanced head's switch, so a jump into Advanced moves it too. */
    private advancedToggle: ToggleComponent | null = null;
    /** Redraws the Advanced grid's pointer to the thinking folder. */
    private pointerRefresh: (() => void) | null = null;
    /** The property-hooks React root, kept across re-renders of its row. */
    private readonly mountHooks = keptRoot((container) => {
        const root = createRoot(container);
        root.render(
            <HookErrorBoundary>
                <PropertyHooksManager plugin={this.plugin} onChange={() => this.refreshGlance()} />
            </HookErrorBoundary>
        );
        return root;
    });

    /**
     * The four glance cards, redrawn in place (#659 runtime audit). Most changes in this tab only
     * re-evaluate visibility or save — they never re-run the glance row's `render` — so the cards
     * listen instead of waiting for the tab to be reopened.
     */
    refreshGlance(): void {
        const host = this.glanceHost;
        if (!host) return;
        const others = flowsWithRole(this.plugin).filter((flow) => flow.role !== "create").length;
        renderGlance(host, settingsGlance(this.plugin.settings, { otherFlows: others }), (id) => this.go(id));
    }

    /** A change that shows or hides rows: re-evaluate visibility, and say it on the glance. */
    private changedInPlace(): void {
        this.refreshDomState();
        this.refreshGlance();
    }

    /**
     * The section bar, drawn inside its own row (#659 runtime audit).
     *
     * It used to be moved out of the row to be a direct child of the tab's scroller, so that
     * `position: sticky` would hold past the end of the shell group. Obsidian's renderer ends every
     * pass with `setChildrenInPlace(groups)`, which removes anything that is not a group: the bar was
     * deleted the moment it was placed. Now nothing moves. The shell group, its item list and this
     * row generate no box (`display: contents`, settingsShell.scss), so the bar's sticky resolves
     * against the scroller itself.
     */
    private placeNav(setting: Setting): () => void {
        setting.settingEl.addClass(c("settings-shell-row"), c("settings-nav-row"));
        const nav = rowContainer(setting, "settings-nav");
        this.sectionBarEl = nav;
        const mark = renderNav(nav, (id) => this.go(id));
        const container = this.containerEl;

        // The frame comes from the tab's own window. Settings open in a window of their own, and the
        // main window's requestAnimationFrame never fires while it is hidden behind it — the bar
        // stopped following the scroll, and a click on it did not light up either.
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = container.win.requestAnimationFrame(() => {
                frame = 0;
                const origin = container.getBoundingClientRect().top;
                const heads = SETTINGS_SECTIONS.flatMap((section) => {
                    const head = container.querySelector<HTMLElement>(`.${sectionClass(section.id)}`);
                    return head ? [{ id: section.id, top: head.getBoundingClientRect().top - origin }] : [];
                });
                mark(sectionInView(heads, nav.offsetHeight + 16));
                const paddingTop = parseFloat(container.win.getComputedStyle(container).paddingTop) || 0;
                nav.toggleClass("is-stuck", barIsStuck(nav.getBoundingClientRect().top - origin, paddingTop));
            });
        };
        container.addEventListener("scroll", onScroll, { passive: true });
        // One line at every width: refit when the tab is resized (and once it is laid out).
        const Observer = (container.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
        const resize = Observer ? new Observer(() => fitNav(nav)) : null;
        // The bar too: it is drawn before it is attached, and the scroller keeps its size between
        // visits — watching only the scroller left it unfitted on the second opening.
        resize?.observe(container);
        resize?.observe(nav);
        return () => {
            resize?.disconnect();
            container.removeEventListener("scroll", onScroll);
            if (frame) container.win.cancelAnimationFrame(frame);
        };
    }

    /** Open Advanced as if its switch were flipped — the switch moves, the rows show, it is saved. */
    private openAdvanced(): void {
        const open = () => this.plugin.settings.showAdvancedSettings === true;
        if (open()) return;
        if (this.advancedToggle) {
            // Obsidian's toggle calls its onChange from setValue when the value changes.
            this.advancedToggle.setValue(true);
            if (open()) return;
        }
        this.plugin.settings.showAdvancedSettings = true;
        void this.plugin.saveSettings();
        this.changedInPlace();
    }

    /**
     * Open on a section from outside the tab (#688) — *Change excluded folders* in This note. The
     * tab may still be drawing when Obsidian hands it over, so the jump waits for its section head,
     * a few frames at most, and gives up quietly: the tab is open either way.
     */
    revealSection(id: SectionId, tries = 10): void {
        if (this.containerEl.querySelector(`.${sectionClass(id)}`)) {
            this.go(id);
            return;
        }
        if (tries > 0) window.setTimeout(() => this.revealSection(id, tries - 1), 50);
    }

    /** Jump to a section: open Advanced first if that is where you are going. */
    private go(id: SectionId): void {
        if (id === "advanced") this.openAdvanced();
        scrollToSection(this.containerEl, id, this.barHeight(), !this.reducedMotion());
    }

    /**
     * The Advanced grid's arrow: to the thinking space folder field itself, ready to type. Landing on
     * Thinking's head left the field far below — you arrived and did not see what you came for.
     */
    private goToThinkingFolder(): void {
        const row = this.containerEl.querySelector<HTMLElement>(`.${c("settings-folder-wide")}`);
        if (!row) {
            this.go("thinking");
            return;
        }
        scrollToRow(this.containerEl, row, this.barHeight(), !this.reducedMotion());
        window.setTimeout(() => row.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 300);
    }

    private barHeight(): number {
        return this.sectionBarEl?.isConnected ? this.sectionBarEl.offsetHeight : 0;
    }

    private reducedMotion(): boolean {
        return activeWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    }

    /** The start card's second way in: to the row that gives a canvas its role, ready to type. */
    private chooseCanvas(): void {
        this.go("flows");
        window.setTimeout(() => {
            // No scroll of its own: the jump above already put the row in view.
            this.containerEl
                .querySelector<HTMLInputElement>(`.${c("settings-assign-row")} input`)
                ?.focus({ preventScroll: true });
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


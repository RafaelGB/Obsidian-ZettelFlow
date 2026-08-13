import { Menu } from "obsidian";
import { PluginComponent, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import ZettelFlow from "main";

type LocaleKey = Parameters<typeof t>[0];

interface ViewEntry {
    /** The `show-*` command id (without the plugin prefix). */
    command: string;
    /** i18n key of the entry's label — reuses the command's own name key (no duplication). */
    labelKey: LocaleKey;
    icon: string;
}

/**
 * One discoverable front door (#231 Phase 2). ZettelFlow's ~12 views were reachable *only* through the
 * command palette (audit finding F1); this adds a single ribbon menu that lists them, grouped, so a
 * user has one obvious place to open Home, the health views, discovery, the graph, and the rest.
 * Additive & consolidate-and-hide — no view is removed; labels reuse the existing command name keys and
 * execution goes through the sanctioned {@link ObsidianApi} command runner.
 */
export class ZettelFlowMenuComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    /** View entries grouped by job; a separator is drawn between groups. Home leads. */
    private static readonly GROUPS: ViewEntry[][] = [
        [{ command: "run-canvas-flow", labelKey: "command_run_canvas_flow", icon: "play" }],
        [{ command: "show-home", labelKey: "command_show_home", icon: "home" }],
        [
            { command: "show-knowledge-dashboard", labelKey: "command_show_knowledge_dashboard", icon: "layout-dashboard" },
            { command: "show-slipbox-health", labelKey: "command_show_slipbox_health", icon: "activity" },
        ],
        // Discovery is now one unified view (#231 Phase 3): surprising connections + notes related to
        // the active note. The standalone resurface command still works but is no longer a menu entry.
        [{ command: "show-discoveries", labelKey: "discovery_view_title", icon: "telescope" }],
        [
            { command: "show-knowledge-map", labelKey: "command_show_knowledge_map", icon: "network" },
            { command: "show-concept-nav", labelKey: "command_show_concept_nav", icon: "waypoints" },
        ],
        [
            { command: "show-open-questions", labelKey: "command_show_open_questions", icon: "help-circle" },
            { command: "show-evolution-timeline", labelKey: "command_show_evolution_timeline", icon: "git-commit-horizontal" },
            { command: "show-thinking-heatmap", labelKey: "command_show_thinking_heatmap", icon: "flame" },
            { command: "show-evidence-map", labelKey: "command_show_evidence_map", icon: "scale" },
        ],
        [{ command: "show-notes-history", labelKey: "command_show_history", icon: "clock" }],
    ];

    onLoad(): void {
        this.plugin.addRibbonIcon("brain-circuit", t("ribbon_open_zettelflow"), (evt: MouseEvent) => {
            const menu = new Menu();
            const prefix = `${this.plugin.manifest.id}:`;
            ZettelFlowMenuComponent.GROUPS.forEach((group, index) => {
                if (index > 0) menu.addSeparator();
                for (const entry of group) {
                    menu.addItem((item) =>
                        item
                            .setTitle(t(entry.labelKey))
                            .setIcon(entry.icon)
                            .onClick(() => ObsidianApi.executeCommandById(`${prefix}${entry.command}`))
                    );
                }
            });
            menu.showAtMouseEvent(evt);
        });
    }
}

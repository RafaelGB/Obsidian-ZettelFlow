import { Menu } from "obsidian";
import { PluginComponent, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { activateSurface } from "architecture/plugin";
import { requestGraph3DFocus } from "architecture/components/core/graph3d/graph3dFocus";
import { ReasoningPathsModal } from "zettelkasten/modals/ReasoningPathsModal";
import { AskGraphModal } from "zettelkasten/modals/AskGraphModal";
import { CommunityTemplatesModal } from "application/community";
import ZettelFlow from "main";

type LocaleKey = Parameters<typeof t>[0];

interface MenuEntry {
    /** The command id (without the plugin prefix) the entry runs. */
    command: string;
    /** i18n key of the entry's label. */
    labelKey: LocaleKey;
    icon: string;
}

/**
 * The single all-in-one ribbon button (#231 Phase 2, #271, #272): one obvious front door. Its menu
 * leads with **Create note**, then the system-adoption actions, then the **four surfaces** (Home ·
 * Health · Discovery · Graph) — the ~12 former per-view entries are now modes inside those surfaces.
 * Additive & consolidate-and-hide: every capability is still reachable; execution goes through the
 * sanctioned command runner / {@link activateSurface}.
 */
export class ZettelFlowMenuComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    /** Menu entries grouped by job; a separator is drawn between groups. Create note leads. */
    private static readonly GROUPS: MenuEntry[][] = [
        [{ command: "open-workflow", labelKey: "menu_create_note", icon: "file-plus" }],
        [
            { command: "browse-systems", labelKey: "command_browse_systems", icon: "layout-grid" },
            { command: "run-canvas-flow", labelKey: "command_run_canvas_flow", icon: "play" },
            { command: "export-canvas-template", labelKey: "command_export_canvas_template", icon: "package-plus" },
        ],
        [
            { command: "show-home", labelKey: "command_show_home", icon: "house" },
            { command: "cultivate", labelKey: "command_cultivate", icon: "sprout" },
            { command: "ask-your-graph", labelKey: "command_ask_graph", icon: "search" },
            { command: "show-health", labelKey: "command_show_health", icon: "stethoscope" },
            { command: "show-discovery", labelKey: "command_show_discovery", icon: "telescope" },
            { command: "show-graph", labelKey: "command_show_graph", icon: "network" },
        ],
    ];

    onLoad(): void {
        // The community systems browser as a first-class, funnel-able command (#246 A1).
        this.plugin.addCommand({
            id: "browse-systems",
            name: t("command_browse_systems"),
            callback: () => new CommunityTemplatesModal(this.plugin).open(),
        });
        // The three surface-opening commands (#272); `show-home` lives in HomeComponent.
        this.plugin.addCommand({
            id: "show-health",
            name: t("command_show_health"),
            callback: () => void activateSurface(this.plugin.app, "zettelflow-health"),
        });
        this.plugin.addCommand({
            id: "show-discovery",
            name: t("command_show_discovery"),
            callback: () => void activateSurface(this.plugin.app, "zettelflow-discovery"),
        });
        this.plugin.addCommand({
            id: "show-graph",
            name: t("command_show_graph"),
            callback: () => void activateSurface(this.plugin.app, "zettelflow-graph"),
        });
        // Start a guided thinking session on the Home surface's Cultivate mode (#309 S4).
        this.plugin.addCommand({
            id: "cultivate",
            name: t("command_cultivate"),
            callback: () => void activateSurface(this.plugin.app, "zettelflow-home", "cultivate"),
        });
        // Deep-link: open the Graph surface at the 3D mode and fly to the active note (#280 S3).
        this.plugin.addCommand({
            id: "explore-in-3d",
            name: t("command_explore_in_3d"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!checking) {
                    requestGraph3DFocus(file.path);
                    void activateSurface(this.plugin.app, "zettelflow-graph", "3d");
                }
                return true;
            },
        });
        // Ask your graph — the deterministic semantic query surface (#318 S3).
        this.plugin.addCommand({
            id: "ask-your-graph",
            name: t("command_ask_graph"),
            callback: () => new AskGraphModal(this.plugin).open(),
        });
        // Trace the argument-forward reasoning chains leaving the active note (#166, #318 S4).
        this.plugin.addCommand({
            id: "explore-reasoning-paths",
            name: t("command_explore_reasoning_paths"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!checking) new ReasoningPathsModal(this.plugin.app, file.path).open();
                return true;
            },
        });
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

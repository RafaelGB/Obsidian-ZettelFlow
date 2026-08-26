import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

type LocaleKey = Parameters<typeof t>[0];

/**
 * The retired per-view "open" commands (#303 S3). Each of the ~12 views collapsed into 4 surfaces
 * (#272), but their opener commands keep their stable ids so any hotkey/pin survives. They were
 * identical one-command components; this registers them all from one table via
 * {@link openSurfaceForCommand}. (Home keeps its own component — it also auto-opens on launch.)
 */
const SURFACE_COMMANDS: { id: string; nameKey: LocaleKey }[] = [
    { id: "show-notes-history", nameKey: "command_show_history" },
    { id: "show-slipbox-health", nameKey: "command_show_slipbox_health" },
    { id: "show-knowledge-dashboard", nameKey: "command_show_knowledge_dashboard" },
    { id: "show-evolution-timeline", nameKey: "command_show_evolution_timeline" },
    { id: "show-thinking-heatmap", nameKey: "command_show_thinking_heatmap" },
    { id: "show-discoveries", nameKey: "command_show_discoveries" },
    { id: "resurface-related-notes", nameKey: "command_resurface" },
    { id: "show-open-questions", nameKey: "command_show_open_questions" },
    { id: "show-evidence-map", nameKey: "command_show_evidence_map" },
    { id: "show-knowledge-map", nameKey: "command_show_knowledge_map" },
    { id: "show-concept-nav", nameKey: "command_show_concept_nav" },
];

export class SurfaceCommandsComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        for (const { id, nameKey } of SURFACE_COMMANDS) {
            this.plugin.addCommand({
                id,
                name: t(nameKey),
                callback: () => openSurfaceForCommand(this.plugin.app, id),
            });
        }
    }
}

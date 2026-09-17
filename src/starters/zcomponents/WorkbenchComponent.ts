import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { WorkbenchView } from "architecture/components/core/workbench/WorkbenchView";
import type { ScriptSurface } from "application/scripts/scriptRunLog";

/**
 * The command that opens the script workbench (#446), and the one door the *try it* buttons use.
 *
 * A single place so the view is opened the same way from the command palette and from a script's
 * own panel — and so priming it with code is not four slightly different pieces of leaf handling.
 */
export class WorkbenchComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "open-script-workbench",
            name: t("workbench_open"),
            callback: () => void openWorkbench(this.plugin),
        });
    }
}

/**
 * Reveal the workbench, optionally with a script already in it. Reuses an open leaf rather than
 * stacking a second bench on every click.
 */
export async function openWorkbench(
    plugin: ZettelFlow,
    primed?: { surface: ScriptSurface; code: string; notePath?: string }
): Promise<void> {
    const { workspace } = plugin.app;
    const existing = workspace.getLeavesOfType(WorkbenchView.NAME).first();
    const leaf = existing ?? workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type: WorkbenchView.NAME, active: true });
    await workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (primed && view instanceof WorkbenchView) {
        view.prime(primed.surface, primed.code, primed.notePath);
    }
}

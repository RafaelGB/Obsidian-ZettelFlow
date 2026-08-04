import { PluginComponent, c } from "architecture";
import ZettelFlow from "main";
import { useNoteBuilderStore } from "application/components/noteBuilder";
import { formatFlowStatus } from "architecture/components/core/flowStatus/flowStatusUtils";

export class FlowStatusComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;
    private unsubscribe: (() => void) | undefined;

    onLoad(): void {
        const item = this.plugin.addStatusBarItem();
        item.addClass(c("flow-status"));
        const textEl = item.createSpan({ cls: c("flow-status-text") });

        const update = (canvasName: string, stepName: string) => {
            const label = formatFlowStatus(canvasName, stepName);
            textEl.textContent = label;
            item.toggleClass(c("flow-status--active"), label.length > 0);
        };

        const initial = useNoteBuilderStore.getState();
        update(initial.activeCanvasName, initial.activeStepName);

        this.unsubscribe = useNoteBuilderStore.subscribe((state) => {
            update(state.activeCanvasName, state.activeStepName);
        });
    }

    onUnload(): void {
        this.unsubscribe?.();
    }
}

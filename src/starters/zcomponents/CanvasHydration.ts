import { PluginComponent, log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import ZettelFlow from "main";

export class CanvasHydration extends PluginComponent {
    private static readonly MAX_RETRIES = 5;
    private static readonly RETRY_DELAY = 200;
    private retries = 0;
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        canvas.flows.add(this.plugin.settings.canvasFilePath).then(() => {
            log.info(`CanvasHydration loaded from ${this.plugin.settings.canvasFilePath}`);
        }).catch((err) => {
            if (this.retries < CanvasHydration.MAX_RETRIES) {
                setTimeout(() => {
                    this.retries += 1;
                    this.onLoad();
                }, CanvasHydration.RETRY_DELAY);
            }
        });

    }
}
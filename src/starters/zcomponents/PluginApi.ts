import { ObsidianAPIService, PluginComponent, log } from "architecture";
import ZettlelFlow from "main";

export class PluginApi extends PluginComponent {
    constructor(private plugin: ZettlelFlow) {
        super(plugin);
    }

    onLoad(): void {
        ObsidianAPIService.init(this.plugin.app);
        log.info('PluginApi loaded');
    }
}
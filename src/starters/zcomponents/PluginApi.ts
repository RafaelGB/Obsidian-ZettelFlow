import { ObsidianAPIService, PluginComponent, log } from "architecture";
import ZettelFlow from "main";

export class PluginApi extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        ObsidianAPIService.init(this.plugin.app);
        log.info('PluginApi loaded');
    }
}
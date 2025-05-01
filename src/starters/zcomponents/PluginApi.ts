import { ObsidianAPIService, PluginComponent } from "architecture";
import { ZfVaultImpl } from "architecture/api";
import { VaultStateManager } from "architecture/plugin";
import ZettelFlow from "main";

export class PluginApi extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        ObsidianAPIService.init(this.plugin.app);
        ZfVaultImpl.instanceInit(this.plugin.app);
        VaultStateManager.init(this.plugin);
    }
}
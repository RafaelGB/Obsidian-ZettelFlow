import { PluginComponent } from "architecture";
import { log } from "architecture";
import { ZettelFlowSettingsTab } from "domain/config/modals/ZettelFlowSettingsTab";
import ZettlelFlow from "main";
export class SettingsTab extends PluginComponent{
    constructor(private plugin:ZettlelFlow){
        super(plugin);
    }

    onLoad(): void { 
        this.plugin.addSettingTab(new ZettelFlowSettingsTab(this.plugin as ZettlelFlow));
        log.info('SettingsTab loaded');
    }
}
import { PluginComponent } from "architecture";
import { log } from "core";
import { ZettelFlowSettingsTab } from "core/config/modals/ZettelFlowSettingsTab";
import ZettlelFlow from "main";
import { Plugin } from "obsidian";
export class SettingsTab extends PluginComponent{
    constructor(private plugin:Plugin){
        super(plugin);
    }

    onLoad(): void { 
        this.plugin.addSettingTab(new ZettelFlowSettingsTab(this.plugin as ZettlelFlow));
        log.info('SettingsTab loaded');
    }
}
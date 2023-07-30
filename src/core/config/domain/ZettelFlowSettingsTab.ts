import ZettlelFlow from "main";
import { PluginSettingTab } from "obsidian";

export class SettingsManager {
    plugin: ZettlelFlow;
    constructor(plugin: ZettlelFlow){
        this.plugin = plugin;
    }
    constructUI(containerEl: HTMLElement, heading: string) {
    }
}

class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettlelFlow;
    manager: SettingsManager;
    constructor(plugin: ZettlelFlow){
        super(plugin.app, plugin);
        this.plugin = plugin;
        this.manager = new SettingsManager(plugin);
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        this.manager.constructUI(containerEl, 'ZettlelFlow Settings');
    }
    
}
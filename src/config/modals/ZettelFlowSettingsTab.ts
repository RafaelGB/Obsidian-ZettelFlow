import ZettlelFlow from "main";
import { PluginSettingTab } from "obsidian";
import { SettingsHandlerInfo } from "../model/SettingsTabModel";
import developer from "./handlers/Developer";
import sections from "./handlers/Sections";

class SettingsManager {
    plugin: ZettlelFlow;
    constructor(plugin: ZettlelFlow) {
        this.plugin = plugin;
    }

    constructUI(containerEl: HTMLElement) {
        const handlerInfo: SettingsHandlerInfo = {
            containerEl: containerEl,
            plugin: this.plugin,
        }
        this.constructBody(handlerInfo);
    }

    private constructBody(handlerInfo: SettingsHandlerInfo): void {
        handlerInfo = sections.run(handlerInfo);
        handlerInfo = developer.run(handlerInfo);
    }

}

export class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettlelFlow;
    manager: SettingsManager;
    constructor(plugin: ZettlelFlow) {
        super(plugin.app, plugin);
        this.plugin = plugin;
        this.manager = new SettingsManager(plugin);
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        this.manager.constructUI(containerEl);
    }

}
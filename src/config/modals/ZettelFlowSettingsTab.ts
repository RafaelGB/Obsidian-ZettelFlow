import ZettelFlow from "main";
import { PluginSettingTab } from "obsidian";
import developer from "./handlers/Developer";
import sections from "./handlers/Sections";
import { SettingsHandlerInfo } from "../typing";

class SettingsManager {
    plugin: ZettelFlow;
    constructor(plugin: ZettelFlow) {
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
        sections.run({ ...handlerInfo, containerEl: handlerInfo.containerEl.createDiv() });
        developer.run({ ...handlerInfo, containerEl: handlerInfo.containerEl.createDiv() });
    }

}

export class ZettelFlowSettingsTab extends PluginSettingTab {
    plugin: ZettelFlow;
    manager: SettingsManager;
    constructor(plugin: ZettelFlow) {
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
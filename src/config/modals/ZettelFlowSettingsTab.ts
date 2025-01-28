import ZettelFlow from "main";
import { PluginSettingTab, setIcon } from "obsidian";
import developer from "./handlers/Developer";
import sections from "./handlers/Sections";
import { SettingsHandlerInfo } from "../typing";
import { c } from "architecture";

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
        const navbar = this.containerEl.createDiv({ cls: c("modal-navbar") });
        const navbarButtonGroup = navbar.createDiv({
            cls: c("navbar-button-group"),
        });

        // Support link
        const supportButton = navbarButtonGroup.createEl("a", {
            href: "https://www.buymeacoffee.com/5tsytn22v9Z",
            title: "Support my Obsidian Plugins",
        }, (el) => {
            el.addClass("mod-cta");
            // style to be aligned text and icon
            el.style.display = "flex";
        });
        supportButton.createDiv({ text: "Support" });
        setIcon(supportButton.createDiv(), "heart");
        this.manager.constructUI(containerEl);
    }

}
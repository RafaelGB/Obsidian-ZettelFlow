import ZettelFlow from "main";
import { PluginSettingTab } from "obsidian";
import developerSectionSettings from "./handlers/DeveloperSectionSettings";
import generalSectionSettings from "./handlers/GeneralSectionSettings";
import hooksSectionSettings from "./handlers/HooksSectionSettings";
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
        generalSectionSettings.run({ ...handlerInfo, containerEl: handlerInfo.containerEl.createDiv() });
        hooksSectionSettings.run({ ...handlerInfo, containerEl: handlerInfo.containerEl.createDiv() });
        developerSectionSettings.run({ ...handlerInfo, containerEl: handlerInfo.containerEl.createDiv() });
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
        const coffeeDiv = navbarButtonGroup.createDiv({ cls: c("navbar-button") });
        coffeeDiv.addClass("ex-coffee-div");
        const coffeeLink = coffeeDiv.createEl("a", {
            href: "https://www.buymeacoffee.com/5tsytn22v9Z",
        });

        const coffeeImg = coffeeLink.createEl("img", {
            attr: {
                src: "https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png",
            },
        });
        coffeeImg.height = 25;
        this.manager.constructUI(containerEl);
    }

}
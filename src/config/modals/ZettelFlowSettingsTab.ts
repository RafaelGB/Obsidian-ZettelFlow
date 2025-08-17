import ZettelFlow from "main";
import { PluginSettingTab } from "obsidian";
import developerSectionSettings from "./handlers/DeveloperSectionSettings";
import generalSectionSettings from "./handlers/GeneralSectionSettings";
import hooksSectionSettings from "./handlers/HooksSectionSettings";
import { SettingsHandlerInfo } from "../typing";
import { c } from "architecture";
import { t } from "architecture/lang";

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
        this.containerEl.empty();
        const navbar = this.containerEl.createDiv({ cls: c("modal-navbar") });
        const navbarButtonGroup = navbar.createDiv({
            cls: c("navbar-button-group"),
        });

        // Support link
        const coffeeDiv = navbarButtonGroup.createDiv({ cls: c("navbar-button") });
        coffeeDiv.addClass("ex-coffee-div");
        const coffeeLink = coffeeDiv.createEl("a", {
            href: "https://www.buymeacoffee.com/5tsytn22v9Z",
            title: t("support_coffee_button")
        });

        const coffeeImg = coffeeLink.createEl("img", {
            attr: {
                src: "https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png",
                alt: t("support_coffee_button")
            },
        });
        coffeeImg.height = 25;
        this.manager.constructUI(this.containerEl);
    }

}
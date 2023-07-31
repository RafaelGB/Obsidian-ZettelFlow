import { ZComponentsManager } from "../services/ZComponentsManager";
import { Plugin } from "obsidian";
import { RibbonIcon } from "../zcomponents/RibbonIcon";
import { SettingsTab } from "../zcomponents/SettingsTab";
import { ZettelFlowSettings } from "core/config/model/ZettelSettingsModel";
import { log } from "core";
/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin:Plugin):void{
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.registerComponent(new SettingsTab(plugin));
    ZComponentsManager.loadComponents();
}

export function loadServicesThatRequireSettings(setttings:ZettelFlowSettings):void{
    log.setDebugMode(setttings.loggerEnabled);
    log.setLevelInfo(setttings.logLevel);
}
// External imports
import { ZettelFlowSettings } from "config";
import { log } from "architecture";
import ZettelFlow from "main";
// Internal imports
import { ZComponentsManager } from "../services/ZComponentsManager";
import { RibbonIcon } from "../zcomponents/RibbonIcon";
import { SettingsTab } from "../zcomponents/SettingsTab";
import { PluginApi } from "../zcomponents/PluginApi";
/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin: ZettelFlow): void {
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.registerComponent(new SettingsTab(plugin));
    ZComponentsManager.registerComponent(new PluginApi(plugin));
    ZComponentsManager.loadComponents();
}

export function loadServicesThatRequireSettings(setttings: ZettelFlowSettings): void {
    log.setDebugMode(setttings.loggerEnabled);
    log.setLevelInfo(setttings.logLevel);
}
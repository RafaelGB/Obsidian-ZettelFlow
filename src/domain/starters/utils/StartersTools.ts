import { ZettelFlowSettings } from "domain/config/model/ZettelSettingsModel";
import { ZComponentsManager } from "../services/ZComponentsManager";
import { RibbonIcon } from "../zcomponents/RibbonIcon";
import { SettingsTab } from "../zcomponents/SettingsTab";
import { log } from "architecture";
import ZettlelFlow from "main";
/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin:ZettlelFlow):void{
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.registerComponent(new SettingsTab(plugin));
    ZComponentsManager.loadComponents();
}

export function loadServicesThatRequireSettings(setttings:ZettelFlowSettings):void{
    log.setDebugMode(setttings.loggerEnabled);
    log.setLevelInfo(setttings.logLevel);
}
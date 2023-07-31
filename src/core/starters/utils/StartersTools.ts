import { ZComponentsManager } from "../services/ZComponentsManager";
import { Plugin } from "obsidian";
import { RibbonIcon } from "../zcomponents/RibbonIcon";
import { SettingsTab } from "../zcomponents/SettingsTab";
/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin:Plugin):void{
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.registerComponent(new SettingsTab(plugin));
    ZComponentsManager.loadComponents();
}
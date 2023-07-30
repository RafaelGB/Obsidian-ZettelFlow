import { ZComponentsManager } from "../services/ZComponentsManager";
import { Plugin } from "obsidian";
import { RibbonIcon } from "../ZComponents/RibbonIcon";
/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin:Plugin):void{
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.loadComponents();
}
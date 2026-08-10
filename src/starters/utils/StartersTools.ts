// External imports
import { ZettelFlowSettings } from "config";
import { log } from "architecture";
import ZettelFlow from "main";
// Internal imports
import { ZComponentsManager } from "../services/ZComponentsManager";
import { RibbonIcon } from "../zcomponents/RibbonIcon";
import { SettingsTab } from "../zcomponents/SettingsTab";
import { PluginApi } from "../zcomponents/PluginApi";
import { HistoryViewComponent } from "../zcomponents/HistoryViewComponent";
import { FlowStatusComponent } from "../zcomponents/FlowStatusComponent";
import { TemplateExportComponent } from "../zcomponents/TemplateExportComponent";
import { OnboardingComponent } from "../zcomponents/OnboardingComponent";
import { SlipboxHealthViewComponent } from "../zcomponents/SlipboxHealthViewComponent";
import { ResurfaceComponent } from "../zcomponents/ResurfaceComponent";
import { StarterFlowsComponent } from "../zcomponents/StarterFlowsComponent";
import { MocBuilderComponent } from "../zcomponents/MocBuilderComponent";
import { AtomicitySplitComponent } from "../zcomponents/AtomicitySplitComponent";
import { KnowledgeIndexComponent } from "../zcomponents/KnowledgeIndexComponent";

/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin: ZettelFlow): void {
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.registerComponent(new SettingsTab(plugin));
    ZComponentsManager.registerComponent(new PluginApi(plugin));
    ZComponentsManager.registerComponent(new HistoryViewComponent(plugin));
    ZComponentsManager.registerComponent(new FlowStatusComponent(plugin));
    ZComponentsManager.registerComponent(new TemplateExportComponent(plugin));
    ZComponentsManager.registerComponent(new OnboardingComponent(plugin));
    ZComponentsManager.registerComponent(new SlipboxHealthViewComponent(plugin));
    ZComponentsManager.registerComponent(new ResurfaceComponent(plugin));
    ZComponentsManager.registerComponent(new StarterFlowsComponent(plugin));
    ZComponentsManager.registerComponent(new MocBuilderComponent(plugin));
    ZComponentsManager.registerComponent(new AtomicitySplitComponent(plugin));
    ZComponentsManager.registerComponent(new KnowledgeIndexComponent(plugin));
    ZComponentsManager.loadComponents();
}

/**
 * Unload all registered plugin components, running their onUnload() and clearing the
 * registry so a re-enable starts from a clean slate.
 */
export function unloadPluginComponents(): void {
    ZComponentsManager.unloadComponents();
}

export function loadServicesThatRequireSettings(setttings: ZettelFlowSettings): void {
    log.setDebugMode(setttings.loggerEnabled);
    log.setLevelInfo(setttings.logLevel);
}
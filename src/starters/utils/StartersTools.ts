// External imports
import { WorkbenchComponent } from "starters/zcomponents/WorkbenchComponent";
import { LOG_LEVEL_OFF } from "config/settingsMigration";
import { ZettelFlowSettings } from "config";
import { log } from "architecture";
import ZettelFlow from "main";
// Internal imports
import { ZComponentsManager } from "../services/ZComponentsManager";
import { RibbonIcon } from "../zcomponents/RibbonIcon";
import { SettingsTab } from "../zcomponents/SettingsTab";
import { PluginApi } from "../zcomponents/PluginApi";
import { FlowStatusComponent } from "../zcomponents/FlowStatusComponent";
import { TemplateExportComponent } from "../zcomponents/TemplateExportComponent";
import { OnboardingComponent } from "../zcomponents/OnboardingComponent";
import { GenerateWeeklyReviewComponent } from "../zcomponents/GenerateWeeklyReviewComponent";
import { HomeComponent } from "../zcomponents/HomeComponent";
import { SurfaceCommandsComponent } from "../zcomponents/SurfaceCommandsComponent";
import { DeriveProjectComponent } from "../zcomponents/DeriveProjectComponent";
import { MocBuilderComponent } from "../zcomponents/MocBuilderComponent";
import { AtomicitySplitComponent } from "../zcomponents/AtomicitySplitComponent";
import { KnowledgeIndexComponent } from "../zcomponents/KnowledgeIndexComponent";
import { StateTransitionComponent } from "../zcomponents/StateTransitionComponent";
import { RemoveRelationComponent } from "../zcomponents/RemoveRelationComponent";
import { ZettelFlowMenuComponent } from "../zcomponents/ZettelFlowMenuComponent";
import { QuickCaptureComponent } from "../zcomponents/QuickCaptureComponent";
import { ThinkAboutComponent } from "../zcomponents/ThinkAboutComponent";

/**
 * Load all components of the plugin with the ZComponent interface
 * @param plugin 
 */
export function loadPluginComponents(plugin: ZettelFlow): void {
    ZComponentsManager.registerComponent(new RibbonIcon(plugin));
    ZComponentsManager.registerComponent(new SettingsTab(plugin));
    ZComponentsManager.registerComponent(new PluginApi(plugin));
    ZComponentsManager.registerComponent(new FlowStatusComponent(plugin));
    ZComponentsManager.registerComponent(new TemplateExportComponent(plugin));
    ZComponentsManager.registerComponent(new OnboardingComponent(plugin));
    ZComponentsManager.registerComponent(new GenerateWeeklyReviewComponent(plugin));
    ZComponentsManager.registerComponent(new HomeComponent(plugin));
    // The retired per-view opener commands, consolidated into one component (#303 S3).
    ZComponentsManager.registerComponent(new SurfaceCommandsComponent(plugin));
    ZComponentsManager.registerComponent(new DeriveProjectComponent(plugin));
    ZComponentsManager.registerComponent(new MocBuilderComponent(plugin));
    ZComponentsManager.registerComponent(new AtomicitySplitComponent(plugin));
    ZComponentsManager.registerComponent(new WorkbenchComponent(plugin));
    ZComponentsManager.registerComponent(new KnowledgeIndexComponent(plugin));
    ZComponentsManager.registerComponent(new StateTransitionComponent(plugin));
    ZComponentsManager.registerComponent(new RemoveRelationComponent(plugin));
    ZComponentsManager.registerComponent(new ZettelFlowMenuComponent(plugin));
    ZComponentsManager.registerComponent(new QuickCaptureComponent(plugin));
    ZComponentsManager.registerComponent(new ThinkAboutComponent(plugin));
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
    // `off` is a level: the separate enable toggle was a second way to say the same thing (#439).
    log.setDebugMode(setttings.logLevel !== LOG_LEVEL_OFF);
    log.setLevelInfo(setttings.logLevel);
}
import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { WelcomeModal } from "./WelcomeModal";

/**
 * First-run onboarding (#246 A1). On the first launch after install, open the {@link WelcomeModal},
 * which funnels the user into the Systems Gallery — the one adoption path — for an immediate first win.
 * Shown once (guarded by `hasSeenWelcome`), after layout is ready so the workspace is interactive.
 */
export class OnboardingComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        if (this.plugin.settings.hasSeenWelcome) return;
        this.plugin.app.workspace.onLayoutReady(() => {
            this.plugin.settings.hasSeenWelcome = true;
            // New users get Home as the daily front door on subsequent launches (#246 A2); overridable.
            this.plugin.settings.openHomeOnStartup = true;
            void this.plugin.saveSettings();
            new WelcomeModal(this.plugin).open();
        });
    }
}

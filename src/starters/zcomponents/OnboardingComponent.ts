import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import ZettelFlow from "main";
import { Notice } from "obsidian";

export class OnboardingComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        if (this.plugin.settings.hasSeenWelcome) return;
        this.plugin.app.workspace.onLayoutReady(() => {
            this.plugin.settings.hasSeenWelcome = true;
            void this.plugin.saveSettings();

            if (this.plugin.settings.ribbonCanvas) return;

            const notice = new Notice("", 0);
            const frag = notice.messageEl.createDiv();
            frag.createSpan({ text: t("onboarding_notice_msg") });
            frag.createEl("br");
            const btn = frag.createEl("button", {
                text: t("onboarding_notice_open_settings"),
            });
            btn.addEventListener("click", () => {
                this.plugin.app.setting.open();
                this.plugin.app.setting.openTabById("zettelflow");
                notice.hide();
            });
        });
    }
}

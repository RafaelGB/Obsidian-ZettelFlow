import { Modal, Setting } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { CommunityTemplatesModal } from "application/community";
import ZettelFlow from "main";

/**
 * First-run welcome (#246 A1). Instead of a bare notice, greet the user, say what ZettelFlow does in
 * one breath, and funnel them straight to the **Systems Gallery** — the one adoption path — so the very
 * first thing they do is install a system and run it (a first win), not read settings. `createEl`/`c()`
 * only; no innerHTML/inline styles.
 */
export class WelcomeModal extends Modal {
    constructor(private plugin: ZettelFlow) {
        super(plugin.app);
    }

    onOpen(): void {
        this.modalEl.addClass(c("modal"));
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: t("welcome_title") });
        contentEl.createEl("p", { text: t("welcome_body") });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(t("welcome_cta_browse"))
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new CommunityTemplatesModal(this.plugin).open();
                    })
            )
            .addButton((btn) => btn.setButtonText(t("welcome_later")).onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

import { App, Modal, Setting } from "obsidian";
import { t } from "architecture/lang";

/**
 * The human-confirmation prompt for a WAIT block (#151). Mirrors `ConfirmModal`, but a WAIT needs a
 * distinct **cancel** path: **Continue** resumes the workflow, **Cancel** aborts it, and closing the
 * modal *without* a choice (Esc / click-away / teardown) is treated as **cancel** — the fail-safe, so
 * a dropped WAIT never resumes into a write. The suspend/resume/abort bookkeeping lives in the pure
 * `WaitMachine`; this modal only forwards the user's choice to the injected callbacks.
 */
export class WaitPromptModal extends Modal {
    private resolved = false;

    constructor(
        app: App,
        private readonly message: string,
        private readonly onContinue: () => void,
        private readonly onCancel: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        this.setTitle(t("workflow_wait_prompt_title"));
        this.contentEl.createEl("p", { text: this.message });
        new Setting(this.contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(t("workflow_wait_continue_button"))
                    .setCta()
                    .onClick(() => {
                        this.resolved = true;
                        this.onContinue();
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText(t("workflow_wait_cancel_button")).onClick(() => {
                    this.resolved = true;
                    this.onCancel();
                    this.close();
                })
            );
    }

    onClose(): void {
        this.contentEl.empty();
        // Closed without an explicit choice (Esc / click-away): fail safe → abort.
        if (!this.resolved) this.onCancel();
    }
}

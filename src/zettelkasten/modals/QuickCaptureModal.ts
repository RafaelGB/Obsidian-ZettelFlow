import { Modal, Notice } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import ZettelFlow from "main";
import { QuickCaptureService } from 'architecture/plugin/services/QuickCaptureService';
import type { InquiryOperation } from 'architecture/knowledge/inquiry/inquiryState';
import { v4 as uuid } from 'uuid';

/**
 * Lowest-friction capture (#285 S3): a single title prompt that writes a **fleeting** note to the
 * Inbox and nudges the user to develop it later. No canvas, no wizard — the fastest possible path to
 * the first note. Mobile-friendly (a plain modal + Enter to submit).
 */
export class QuickCaptureModal extends Modal {
    private operation: InquiryOperation | undefined;
    private busy = false;
    constructor(private readonly plugin: ZettelFlow, private readonly options: { capture?: (title: string) => Promise<boolean> } = {}) {
        super(plugin.app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: t("quick_capture_title") });
        const input = contentEl.createEl("input", { type: "text", cls: c("quick-capture-input") });
        input.placeholder = t("quick_capture_placeholder");
        input.setAttribute("aria-label", t("quick_capture_placeholder"));
        input.focus();

        const status = contentEl.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
        const submit = async () => {
            const title = input.value.trim();
            if (!title || this.busy) return;
            this.busy = true; button.disabled = true; status.setText(t('quick_capture_saving'));
            try {
                const success = await (this.options.capture ? this.options.capture(title) : this.capture(title));
                if (success) this.close(); else status.setText(t('quick_capture_retry'));
            } catch { status.setText(t('quick_capture_retry')); }
            finally { this.busy = false; button.disabled = false; }
        };
        input.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") void submit();
        });
        const button = contentEl.createEl("button", { text: t("quick_capture_button"), cls: "mod-cta" });
        button.addEventListener("click", () => void submit());
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async capture(title: string): Promise<boolean> {
        try {
            const service = new QuickCaptureService(this.plugin.app.vault);
            this.operation ??= service.plan(title, uuid());
            const result = await service.write(this.operation);
            if (result.status !== 'created' && result.status !== 'already-created') throw new Error('Capture failed');
            new Notice(t("quick_capture_captured", title));
            return true;
        } catch {
            log.error("[QuickCapture] capture failed");
            new Notice(t("quick_capture_error"));
            return false;
        }
    }
}

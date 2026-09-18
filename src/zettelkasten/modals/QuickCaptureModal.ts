import { Modal, Notice } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import ZettelFlow from "main";
import { ThoughtStore } from 'architecture/plugin/thinking/ThoughtStore';

/**
 * Lowest-friction capture (#285 S3, #475).
 *
 * One prompt, Enter to submit, and it lands in the **Thought Lab**.
 *
 * It used to write `Inbox/<title>.md` with `state: fleeting` — three commitments before you had
 * decided anything: that it is a **note**, that it has a **title**, and that it has a **lifecycle
 * state**. It was immediately in the knowledge model, could be an orphan, counted in Health, and
 * was one more thing in an inbox to get through.
 *
 * An impulse has no subject. That is the Lab's territory by definition, and nothing should be
 * classified before you have decided it is an idea.
 */
export class QuickCaptureModal extends Modal {
    private busy = false;
    constructor(plugin: ZettelFlow, private readonly options: { capture?: (text: string) => Promise<boolean> } = {}) {
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

    private async capture(text: string): Promise<boolean> {
        const store = ThoughtStore.getInstance();
        if (!store.folder()) {
            // Said plainly rather than falling back to creating a note: falling back is how you
            // end up with the thing this change exists to stop.
            new Notice(t("quick_capture_no_lab"));
            return false;
        }
        try {
            const made = await store.write(text);
            if (!made) throw new Error('Capture failed');
            new Notice(t("quick_capture_captured"));
            return true;
        } catch {
            log.error("[QuickCapture] capture failed");
            new Notice(t("quick_capture_error"));
            return false;
        }
    }
}

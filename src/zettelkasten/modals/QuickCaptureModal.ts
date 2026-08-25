import { Modal, Notice, normalizePath } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import ZettelFlow from "main";

const CAPTURE_FOLDER = "Inbox";

/**
 * Lowest-friction capture (#285 S3): a single title prompt that writes a **fleeting** note to the
 * Inbox and nudges the user to develop it later. No canvas, no wizard — the fastest possible path to
 * the first note. Mobile-friendly (a plain modal + Enter to submit).
 */
export class QuickCaptureModal extends Modal {
    constructor(private readonly plugin: ZettelFlow) {
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

        const submit = () => {
            const title = input.value.trim();
            if (!title) return;
            void this.capture(title);
            this.close();
        };
        input.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") submit();
        });
        const button = contentEl.createEl("button", { text: t("quick_capture_button"), cls: "mod-cta" });
        button.addEventListener("click", () => submit());
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async capture(title: string): Promise<void> {
        const { vault } = this.plugin.app;
        try {
            const folder = normalizePath(CAPTURE_FOLDER);
            if (!vault.getAbstractFileByPath(folder)) {
                await vault.createFolder(folder).catch(() => undefined);
            }
            const safe = title.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim();
            let path = `${folder}/${safe}.md`;
            if (vault.getAbstractFileByPath(path)) path = `${folder}/${safe} ${Date.now()}.md`;
            await vault.create(path, `---\nstate: fleeting\n---\n\n# ${title}\n`);
            new Notice(t("quick_capture_captured", title));
        } catch (error) {
            log.error("[QuickCapture] failed to capture", error);
            new Notice(t("quick_capture_error"));
        }
    }
}

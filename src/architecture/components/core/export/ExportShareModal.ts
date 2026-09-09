import { App, Modal, Setting } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { saveExportToVault } from "./saveExport";

export interface ExportPayload {
    blob: Blob;
    baseName: string;
    kind: "image" | "video";
}

/**
 * The **share dialog** for a captured graph (A3, #386): preview the artifact, edit the file name, save
 * it to the vault. Accessible (ARIA labels, keyboard-operable), DOM via `createEl`/`empty()`, styled by
 * `c()` classes; object URLs are revoked on close. Reused by B4 (#387) for the idea card.
 */
export class ExportShareModal extends Modal {
    private objectUrl: string | null = null;

    constructor(app: App, private readonly payload: ExportPayload) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass(c("graph3d-export-modal"));
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: t("graph3d_export_title") });
        contentEl.createEl("p", { text: t("graph3d_export_desc"), cls: c("graph3d-export-desc") });

        this.objectUrl = URL.createObjectURL(this.payload.blob);
        const preview = contentEl.createDiv({ cls: c("graph3d-export-preview") });
        if (this.payload.kind === "video") {
            const video = preview.createEl("video", {
                cls: c("graph3d-export-media"),
                attr: { controls: "true", "aria-label": t("graph3d_export_preview_label") },
            });
            video.src = this.objectUrl;
        } else {
            const img = preview.createEl("img", {
                cls: c("graph3d-export-media"),
                attr: { alt: t("graph3d_export_preview_label"), "aria-label": t("graph3d_export_preview_label") },
            });
            img.src = this.objectUrl;
        }

        let name = this.payload.baseName;
        new Setting(contentEl)
            .setName(t("graph3d_export_filename_label"))
            .addText((text) => text.setValue(name).onChange((value) => (name = value)));

        const status = contentEl.createEl("p", {
            cls: c("graph3d-export-status"),
            attr: { "aria-live": "polite" },
        });

        new Setting(contentEl).addButton((btn) =>
            btn
                .setCta()
                .setButtonText(t("graph3d_export_save"))
                .onClick(async () => {
                    try {
                        const file = await saveExportToVault(this.payload.blob, name.trim() || this.payload.baseName);
                        status.setText(t("graph3d_export_saved", file.path));
                    } catch (error) {
                        log.error("[export] save failed", error);
                        status.setText(t("graph3d_export_failed"));
                    }
                })
        );
    }

    onClose(): void {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
        this.contentEl.empty();
    }
}

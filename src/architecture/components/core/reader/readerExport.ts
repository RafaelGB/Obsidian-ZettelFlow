import { Modal, TFile, normalizePath, type App } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { FolderSuggest } from "architecture/settings/suggesters/FolderSuggest";
import { FileService } from "architecture/plugin/services/FileService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import type { Thought } from "application/thinking/thought";
import {
    buildReadingDocument,
    exportFileName,
    freeExportPath,
    stripFrontmatter,
    type ExportHighlight,
    type ExportMode,
} from "./readerDocument";

/**
 * **Export a reading as one document** (#672) — the one place in the Reader, beside highlights,
 * that writes, and only when you press Export.
 *
 * Create-only: a free path is found next to anything that exists, never over it. The write is
 * recorded in a batch of its own, so the end card can offer *Undo*, which sends the new note to
 * the trash. The notes you read are only read.
 */
export interface ExportPlan {
    title: string;
    intro: string;
    /** The chapters, in reading order, by path. */
    chapters: readonly string[];
    folder: string;
    fileName: string;
    mode: ExportMode;
}

export interface ExportResult {
    ok: boolean;
    path?: string;
    batch?: string;
}

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Your highlights on the chapters, in reading order, then in the order you made them. */
export async function highlightsOn(chapters: readonly string[]): Promise<Thought[]> {
    const store = ThoughtStore.getInstance();
    const out: Thought[] = [];
    for (const path of chapters) {
        try {
            out.push(...(await store.highlightsAbout(path)));
        } catch (error) {
            log.debug(`[Reader] no highlights for ${path}: ${String(error)}`);
        }
    }
    return out;
}

export async function writeExport(app: App, plan: ExportPlan, highlights: readonly Thought[]): Promise<ExportResult> {
    const folder = plan.folder.trim() ? normalizePath(plan.folder.trim()) : "";
    const path = freeExportPath(folder, exportFileName(plan.fileName), (p) => app.vault.getAbstractFileByPath(p) !== null);
    try {
        const chapters = [];
        for (const chapterPath of plan.chapters) {
            const file = app.vault.getAbstractFileByPath(chapterPath);
            const link = file instanceof TFile ? app.metadataCache.fileToLinktext(file, path, true) : noteName(chapterPath);
            const body = plan.mode === "copy" && file instanceof TFile ? stripFrontmatter(await app.vault.cachedRead(file)) : undefined;
            chapters.push({ name: noteName(chapterPath), link, body });
        }
        const appendix: ExportHighlight[] = highlights
            .filter((thought) => thought.quote?.exact && thought.about)
            .map((thought) => ({ note: noteName(thought.about ?? ""), passage: thought.quote?.exact ?? "", comment: thought.text }));
        const content = buildReadingDocument({
            title: plan.title,
            intro: plan.intro,
            chapters,
            highlights: appendix,
            mode: plan.mode,
            appendixTitle: t("reader_export_appendix"),
        });
        let batch: string | undefined;
        await withWriteBatch({ kind: "manual", ref: "reader-export", label: path }, async () => {
            batch = currentWriteBatch();
            await FileService.createFile(path, content, false);
        });
        return { ok: true, path, batch };
    } catch (error) {
        log.error(`[Reader] could not export the reading to ${path}: ${error instanceof Error ? error.message : String(error)}`);
        return { ok: false };
    }
}

/**
 * The preview before anything is written: the chapters, the appendix, how each chapter is
 * carried, and where the document goes. Export writes; Cancel and Esc write nothing.
 */
export class ReadingExportModal extends Modal {
    private mode: ExportMode = "embed";
    private highlights: Thought[] = [];
    private folder: string;
    private fileName: string;
    private busy = false;
    /** The one line that changes when the highlights arrive — nothing else is redrawn. */
    private appendixEl: HTMLElement | null = null;

    constructor(
        app: App,
        private readonly plan: Omit<ExportPlan, "mode" | "folder" | "fileName"> & { folder: string; fileName: string },
        private readonly onDone: (result: ExportResult) => void
    ) {
        super(app);
        this.folder = plan.folder;
        this.fileName = plan.fileName;
    }

    onOpen(): void {
        this.setTitle(t("reader_export_title"));
        this.render();
        void highlightsOn(this.plan.chapters).then((found) => {
            this.highlights = found;
            this.renderAppendix();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass(c("reader-export"));
        contentEl.createDiv({ cls: c("reader-export-intro"), text: t("reader_export_intro") });

        const modes = contentEl.createDiv({ cls: c("reader-export-modes"), attr: { role: "radiogroup" } });
        const cards: { value: ExportMode; card: HTMLElement }[] = [];
        const mode = (value: ExportMode, name: Parameters<typeof t>[0], desc: Parameters<typeof t>[0]) => {
            const on = this.mode === value;
            const card = modes.createEl("button", {
                cls: [c("reader-export-mode"), ...(on ? ["is-active"] : [])].join(" "),
                attr: { type: "button", role: "radio", "aria-checked": String(on) },
            });
            card.createDiv({ cls: c("reader-export-mode-name"), text: t(name) });
            card.createDiv({ cls: c("reader-export-mode-desc"), text: t(desc) });
            cards.push({ value, card });
            // Choosing a way only moves the mark: what you typed in the fields stays.
            card.addEventListener("click", () => {
                this.mode = value;
                for (const entry of cards) {
                    entry.card.toggleClass("is-active", entry.value === value);
                    entry.card.setAttribute("aria-checked", String(entry.value === value));
                }
            });
        };
        mode("embed", "reader_export_mode_embed", "reader_export_mode_embed_desc");
        mode("copy", "reader_export_mode_copy", "reader_export_mode_copy_desc");

        const list = contentEl.createEl("ol", { cls: c("reader-export-chapters") });
        for (const path of this.plan.chapters) list.createEl("li", { text: noteName(path) });
        this.appendixEl = contentEl.createDiv({ cls: c("reader-export-appendix") });
        this.renderAppendix();

        const fields = contentEl.createDiv({ cls: c("reader-export-fields") });
        const field = (labelKey: Parameters<typeof t>[0], value: string, onInput: (v: string) => void) => {
            const label = fields.createEl("label", { cls: c("reader-export-field") });
            label.createSpan({ text: t(labelKey) });
            const input = label.createEl("input", { attr: { type: "text", value } });
            input.value = value;
            input.addEventListener("input", () => onInput(input.value));
            return input;
        };
        const folderInput = field("reader_export_folder", this.folder, (v) => (this.folder = v));
        new FolderSuggest(folderInput, (path) => (this.folder = path));
        field("reader_export_name", this.fileName, (v) => (this.fileName = v));

        const actions = contentEl.createDiv({ cls: c("reader-export-actions") });
        const cancel = actions.createEl("button", { attr: { type: "button" }, text: t("reader_export_cancel") });
        cancel.addEventListener("click", () => this.close());
        const go = actions.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("reader_export_confirm") });
        go.addEventListener("click", () => void this.export(go));
    }

    private renderAppendix(): void {
        this.appendixEl?.setText(
            this.highlights.length
                ? tCount(this.highlights.length, "reader_export_highlights", String(this.highlights.length))
                : t("reader_export_no_highlights")
        );
    }

    private async export(button: HTMLButtonElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        button.disabled = true;
        const result = await writeExport(
            this.app,
            { ...this.plan, folder: this.folder.trim(), fileName: this.fileName.trim(), mode: this.mode },
            this.highlights
        );
        this.busy = false;
        this.close();
        this.onDone(result);
    }
}

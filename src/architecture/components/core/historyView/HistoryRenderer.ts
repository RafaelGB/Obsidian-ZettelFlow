import { moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { clearHistory, HistoryEntry } from "application/notes/historyUtils";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

const moment = obsidianMoment as unknown as typeof MomentFn;

/**
 * The **Recent** mode of the Home surface (#272, formerly `HistoryView`): recently built notes with
 * quick-open links and a clear-history action. Render byte-identical to the old view.
 */
export class HistoryRenderer extends KnowledgeModeRenderer {
    constructor(container: HTMLElement, private readonly plugin: ZettelFlow) {
        super(container);
    }

    onload(): void {
        this.render();
    }

    onunload(): void {
        this.container.empty();
    }

    render(): void {
        const contentEl = this.container;
        contentEl.empty();

        const header = contentEl.createDiv({ cls: c("history-header") });
        header.createEl("h4", { text: t("history_view_title"), cls: c("history-title") });
        const clearBtn = header.createEl("button", {
            text: t("history_clear_button"),
            cls: c("history-clear-button"),
        });
        this.registerDomEvent(clearBtn, "click", () => {
            this.plugin.settings.history = clearHistory();
            void this.plugin.saveSettings();
            this.render();
        });

        const history = this.plugin.settings.history ?? [];
        if (history.length === 0) {
            contentEl.createDiv({
                cls: c("history-empty"),
                text: t("history_empty_message"),
            });
            return;
        }

        const list = contentEl.createDiv({ cls: c("history-list") });
        for (const entry of history) {
            this.renderEntry(list, entry);
        }
    }

    private renderEntry(container: HTMLElement, entry: HistoryEntry): void {
        const app = this.plugin.app;
        const row = container.createDiv({ cls: c("history-entry") });

        const info = row.createDiv({ cls: c("history-entry-info") });
        const noteFile = app.vault.getAbstractFileByPath(entry.notePath);
        const noteName = entry.notePath.split("/").pop()?.replace(/\.md$/, "") ?? entry.notePath;
        const noteEl = info.createSpan({ cls: c("history-note-name"), text: noteName });
        if (!noteFile) noteEl.addClass(c("history-missing"));
        noteEl.setAttribute("title", noteFile ? entry.notePath : t("history_file_not_found"));
        noteEl.addEventListener("click", () => {
            if (noteFile) void app.workspace.openLinkText(entry.notePath, "", false);
        });

        const canvasFile = app.vault.getAbstractFileByPath(entry.canvasPath);
        const canvasName = entry.canvasPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? entry.canvasPath;
        const canvasEl = info.createSpan({
            cls: c("history-canvas-name"),
            text: `← ${canvasName}`,
        });
        if (!canvasFile) canvasEl.addClass(c("history-missing"));
        canvasEl.setAttribute("title", canvasFile ? entry.canvasPath : t("history_file_not_found"));
        canvasEl.addEventListener("click", () => {
            if (canvasFile) void app.workspace.openLinkText(entry.canvasPath, "", false);
        });

        row.createDiv({
            cls: c("history-timestamp"),
            text: moment(entry.createdAt).fromNow(),
        });
    }
}

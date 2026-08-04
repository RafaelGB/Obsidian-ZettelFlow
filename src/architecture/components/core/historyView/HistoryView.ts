import { App, ItemView, WorkspaceLeaf, moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import ZettelFlow from "main";
import { c } from "architecture";
import { t } from "architecture/lang";
import { appendHistory, clearHistory, HistoryEntry } from "application/notes/historyUtils";

const moment = obsidianMoment as unknown as typeof MomentFn;

export class HistoryView extends ItemView {
    static readonly NAME = "zettelflow-history";

    constructor(leaf: WorkspaceLeaf, private plugin: ZettelFlow) {
        super(leaf);
    }

    getViewType(): string {
        return HistoryView.NAME;
    }

    getDisplayText(): string {
        return t("history_view_title");
    }

    getIcon(): string {
        return "history";
    }

    async onOpen(): Promise<void> {
        this.render();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    render(): void {
        const { contentEl } = this;
        contentEl.empty();

        const header = contentEl.createDiv({ cls: c("history-header") });
        header.createEl("h4", { text: t("history_view_title"), cls: c("history-title") });
        const clearBtn = header.createEl("button", {
            text: t("history_clear_button"),
            cls: c("history-clear-button"),
        });
        clearBtn.addEventListener("click", () => {
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
        const row = container.createDiv({ cls: c("history-entry") });

        const info = row.createDiv({ cls: c("history-entry-info") });
        const noteFile = this.app.vault.getAbstractFileByPath(entry.notePath);
        const noteName = entry.notePath.split("/").pop()?.replace(/\.md$/, "") ?? entry.notePath;
        const noteEl = info.createSpan({ cls: c("history-note-name"), text: noteName });
        if (!noteFile) noteEl.addClass(c("history-missing"));
        noteEl.setAttribute("title", noteFile ? entry.notePath : t("history_file_not_found"));
        noteEl.addEventListener("click", () => {
            if (noteFile) void this.app.workspace.openLinkText(entry.notePath, "", false);
        });

        const canvasFile = this.app.vault.getAbstractFileByPath(entry.canvasPath);
        const canvasName = entry.canvasPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? entry.canvasPath;
        const canvasEl = info.createSpan({
            cls: c("history-canvas-name"),
            text: `← ${canvasName}`,
        });
        if (!canvasFile) canvasEl.addClass(c("history-missing"));
        canvasEl.setAttribute("title", canvasFile ? entry.canvasPath : t("history_file_not_found"));
        canvasEl.addEventListener("click", () => {
            if (canvasFile) void this.app.workspace.openLinkText(entry.canvasPath, "", false);
        });

        row.createDiv({
            cls: c("history-timestamp"),
            text: moment(entry.createdAt).fromNow(),
        });
    }

    /** Record a new note in history and refresh any open HistoryView leaf. */
    static record(app: App, plugin: ZettelFlow, notePath: string, canvasPath: string): void {
        plugin.settings.history = appendHistory(plugin.settings.history ?? [], {
            notePath,
            canvasPath,
            createdAt: Date.now(),
        });
        void plugin.saveSettings();
        app.workspace.getLeavesOfType(HistoryView.NAME).forEach((leaf) => {
            (leaf.view as HistoryView).render();
        });
    }
}

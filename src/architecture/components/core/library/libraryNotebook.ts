import { Modal, TFile, normalizePath, setIcon, type App, type Component } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { FolderSuggest } from "architecture/settings/suggesters/FolderSuggest";
import { FileService } from "architecture/plugin/services/FileService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { offerUndo } from "architecture/plugin/writes/undoNotice";
import { exportFileName, freeExportPath } from "architecture/components/core/reader/readerDocument";
import { HIGHLIGHT_MEANINGS, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { buildNotebook, filterNotebook, readingNoteMarkdown, type Notebook, type NotebookGroup } from "application/library/notebook";
import type { Thought } from "application/thinking/thought";
import type { ShelfItem } from "application/library/shelf";

type LocaleKey = Parameters<typeof t>[0];

/** The name each meaning shows (#720); a literal map, so the locale guardrail sees every key. */
const MEANING_LABEL: Record<HighlightMeaning, LocaleKey> = {
    idea: "reader_hl_meaning_idea",
    question: "reader_hl_meaning_question",
    quote: "reader_hl_meaning_quote",
    discuss: "reader_hl_meaning_discuss",
};

export interface NotebookFilter {
    meaning: HighlightMeaning | null;
    withNotes: boolean;
}

export interface NotebookParts {
    app: App;
    scope: Component;
    /** The thoughts about this source: its highlights and its margin notes. */
    load: () => Promise<Thought[]>;
    filter: NotebookFilter;
    setFilter: (next: NotebookFilter) => void;
    /** Back to the shelf. */
    back: () => void;
    /** Into the Reader: where you were, or at one passage. */
    open: (at?: { chapter?: number; highlight?: string }) => void;
    /** One passage into a note, through the crystallize preview (#683). */
    toNote: (thought: Thought) => void;
    /** Where the last reading note went, so the next one goes there too. */
    folder: string;
    rememberFolder: (folder: string) => void;
}

/**
 * **The book notebook** (#721, epic #723): everything you marked in one book, in reading order, by
 * chapter — each passage with its meaning, your note and its place — filtered by meaning or to what
 * carries a note, and taken out as one reading note. It writes only when you accept the preview.
 */
export function renderNotebook(host: HTMLElement, item: ShelfItem, parts: NotebookParts): void {
    const { scope } = parts;
    host.empty();
    const page = host.createDiv({ cls: c("notebook") });
    const crumbs = page.createDiv({ cls: c("notebook-crumbs") });
    const back = crumbs.createEl("button", { cls: c("notebook-back"), attr: { type: "button" } });
    setIcon(back.createSpan({ cls: c("notebook-back-icon") }), "chevron-left");
    back.createSpan({ text: t("shelf_title") });
    scope.registerDomEvent(back, "click", () => parts.back());
    crumbs.createSpan({ cls: c("notebook-crumb"), text: `› ${item.title} › ${t("notebook_title")}` });

    const head = page.createDiv({ cls: c("notebook-head") });
    const what = head.createDiv({ cls: c("notebook-what") });
    what.createEl("h2", { cls: c("notebook-title"), text: item.title });
    if (item.author) what.createDiv({ cls: c("notebook-author"), text: item.author });
    const counts = what.createDiv({ cls: c("notebook-counts"), text: t("shelf_detail_loading") });
    const actions = head.createDiv({ cls: c("notebook-actions") });
    const resume = actions.createEl("button", { attr: { type: "button" }, text: t("notebook_continue") });
    scope.registerDomEvent(resume, "click", () => parts.open());
    const exportButton = actions.createEl("button", { cls: "mod-cta", attr: { type: "button", disabled: "true" }, text: t("notebook_export") });

    const filters = page.createDiv({ cls: c("notebook-filters") });
    const list = page.createDiv({ cls: c("notebook-list") });

    void parts
        .load()
        .then((thoughts) => {
            if (list.isConnected === false) return;
            const book = buildNotebook(thoughts, (at) => t("notebook_place", String(at + 1)));
            counts.setText(`${tCount(book.highlights, "notebook_highlights", String(book.highlights))} · ${tCount(book.notes, "notebook_notes", String(book.notes))}`);
            if (book.groups.length === 0) {
                list.createDiv({ cls: c("notebook-empty"), text: t("notebook_empty") });
                return;
            }
            renderFilters(filters, book, parts);
            const shown = filterNotebook(book.groups, parts.filter);
            renderGroups(list, shown, parts);
            exportButton.removeAttribute("disabled");
            scope.registerDomEvent(exportButton, "click", () => new ReadingNoteModal(parts.app, item, shown, parts).open());
        })
        .catch((error: unknown) => {
            log.warn(`[Library] could not open the notebook of ${item.id}: ${String(error)}`);
            counts.setText("");
            list.createDiv({ cls: c("notebook-empty"), text: t("notebook_empty") });
        });
}

function renderFilters(host: HTMLElement, book: Notebook, parts: NotebookParts): void {
    const { scope, filter } = parts;
    const chip = (label: string, count: number, on: boolean, meaning: HighlightMeaning | null) => {
        const el = host.createEl("button", {
            cls: [c("reader-hl-filter-chip"), ...(on ? ["is-active"] : [])],
            attr: { type: "button", "aria-pressed": String(on) },
        });
        if (meaning) el.createSpan({ cls: [c("reader-hl-swatch"), c(`reader-hl-swatch--${meaning}`)] });
        el.createSpan({ text: label });
        el.createSpan({ cls: c("reader-hl-filter-count"), text: String(count) });
        scope.registerDomEvent(el, "click", () => parts.setFilter({ ...filter, meaning: filter.meaning === meaning ? null : meaning }));
    };
    chip(t("reader_hl_filter_all"), book.highlights, filter.meaning === null, null);
    for (const meaning of HIGHLIGHT_MEANINGS) {
        if (book.byMeaning[meaning] > 0 || filter.meaning === meaning) chip(t(MEANING_LABEL[meaning]), book.byMeaning[meaning], filter.meaning === meaning, meaning);
    }
    const notes = host.createEl("button", {
        cls: [c("reader-hl-filter-chip"), c("notebook-with-notes"), ...(filter.withNotes ? ["is-active"] : [])],
        attr: { type: "button", "aria-pressed": String(filter.withNotes) },
        text: t("notebook_with_notes"),
    });
    scope.registerDomEvent(notes, "click", () => parts.setFilter({ ...filter, withNotes: !filter.withNotes }));
}

function renderGroups(host: HTMLElement, groups: readonly NotebookGroup[], parts: NotebookParts): void {
    const { scope } = parts;
    if (groups.length === 0) {
        host.createDiv({ cls: c("notebook-empty"), text: t("notebook_none_match") });
        return;
    }
    for (const group of groups) {
        const section = host.createDiv({ cls: c("notebook-group") });
        if (group.title) section.createEl("h3", { cls: c("notebook-group-title"), text: group.title });
        for (const entry of group.entries) {
            const card = section.createDiv({ cls: [c("notebook-entry"), c(`reader-hl-item--${entry.meaning}`)] });
            if (entry.quote) card.createDiv({ cls: c("notebook-quote"), text: entry.quote });
            if (entry.note) card.createDiv({ cls: c("notebook-note"), text: entry.note });
            const foot = card.createDiv({ cls: c("notebook-foot") });
            foot.createSpan({ cls: c("notebook-where"), text: entry.quote ? `${entry.label} · ${t(MEANING_LABEL[entry.meaning])}` : entry.label });
            const go = foot.createEl("button", { cls: c("notebook-action"), attr: { type: "button" }, text: t("notebook_open_reader") });
            scope.registerDomEvent(go, "click", () => parts.open({ ...(entry.at !== null ? { chapter: entry.at } : {}), highlight: entry.id }));
            if (entry.quote) {
                const toNote = foot.createEl("button", { cls: c("notebook-action"), attr: { type: "button" }, text: t("notebook_to_note") });
                scope.registerDomEvent(toNote, "click", () => parts.toNote(entry.thought));
            }
        }
    }
}

/**
 * The reading note's preview (#721): exactly what will be written, where, and nothing until you
 * press *Create note* (§XII). One recorded write, with its Undo.
 */
class ReadingNoteModal extends Modal {
    private folder: string;

    constructor(
        app: App,
        private readonly item: ShelfItem,
        private readonly groups: readonly NotebookGroup[],
        private readonly parts: NotebookParts
    ) {
        super(app);
        this.folder = parts.folder;
    }

    private markdown(target: string): string {
        const file = this.item.file ? this.app.vault.getAbstractFileByPath(this.item.file) : null;
        const link = file instanceof TFile ? this.app.metadataCache.fileToLinktext(file, target, false) : (this.item.file ?? this.item.title);
        return readingNoteMarkdown({ title: this.item.title, sourceLink: `[[${link}|${this.item.title}]]`, groups: this.groups });
    }

    private target(): string {
        const folder = this.folder.trim() ? normalizePath(this.folder.trim()) : "";
        return freeExportPath(folder, exportFileName(this.item.title), (path) => this.app.vault.getAbstractFileByPath(path) !== null);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass(c("notebook-export"));
        this.titleEl.setText(t("notebook_export"));
        contentEl.createDiv({ cls: c("notebook-export-intro"), text: t("notebook_export_intro") });
        const field = contentEl.createDiv({ cls: c("notebook-export-field") });
        field.createSpan({ text: t("notebook_export_folder") });
        const input = field.createEl("input", { attr: { type: "text", placeholder: t("notebook_export_folder_placeholder") } });
        input.value = this.folder;
        new FolderSuggest(input, (path) => {
            input.value = path;
            this.folder = path;
            redraw();
        });
        const where = contentEl.createDiv({ cls: c("notebook-export-where") });
        const preview = contentEl.createEl("pre", { cls: c("notebook-export-preview") });
        const redraw = () => {
            const target = this.target();
            where.setText(t("notebook_export_where", target));
            preview.setText(this.markdown(target));
        };
        input.addEventListener("input", () => {
            this.folder = input.value;
            redraw();
        });
        redraw();
        const actions = contentEl.createDiv({ cls: c("notebook-export-actions") });
        const cancel = actions.createEl("button", { attr: { type: "button" }, text: t("notebook_export_cancel") });
        cancel.addEventListener("click", () => this.close());
        const create = actions.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("notebook_export_create") });
        create.addEventListener("click", () => void this.create(create));
    }

    private async create(button: HTMLElement): Promise<void> {
        button.setAttribute("disabled", "true");
        const path = this.target();
        let batch: string | undefined;
        try {
            await withWriteBatch({ kind: "manual", ref: "reading-note", label: path }, async () => {
                batch = currentWriteBatch();
                await FileService.createFile(path, this.markdown(path), true);
            });
        } catch (error) {
            log.error(`[Library] could not write the reading note ${path}: ${String(error)}`);
            button.removeAttribute("disabled");
            return;
        }
        this.parts.rememberFolder(this.folder.trim());
        if (batch) offerUndo(batch, path, t("notebook_export_created", path.split("/").pop() ?? path));
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

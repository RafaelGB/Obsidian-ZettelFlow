import { AbstractInputSuggest, type App, type Component, type TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";
import { hoverPreview } from "architecture/components/core/a11y";
import { UNDO_OFFER_MS } from "application/writes/undoOffer";
import { undoBatch, type UndoResult } from "architecture/plugin/writes/undoNotice";
import { fold, type ShelfItem } from "application/library/shelf";
import {
    BOOK_STATUSES,
    TEXT_FIELDS,
    fieldText,
    isBookStatus,
    parseField,
    readBookNote,
    type BookChange,
    type BookDetails,
    type BookStatus,
    type DeclaredMetadata,
    type TextField,
} from "application/library/bookNote";
import { adoptNote, createBookNote, editArticle, editBookNote, noteAt, type BookNoteWrite, type CreateBookNote } from "./bookNoteWriter";
import { dropIn } from "./libraryFlip";

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key the section draws. */
const FIELD_KEY: Record<TextField, LocaleKey> = {
    title: "shelf_details_field_title",
    author: "shelf_details_field_author",
    series: "shelf_details_field_series",
    publisher: "shelf_details_field_publisher",
    year: "shelf_details_field_year",
    language: "shelf_details_field_language",
    isbn: "shelf_details_field_isbn",
    tags: "shelf_details_field_tags",
};
export const STATUS_KEY: Record<BookStatus, LocaleKey> = {
    "to-read": "shelf_status_to_read",
    reading: "shelf_status_reading",
    finished: "shelf_status_finished",
};
const INVALID_KEY: Partial<Record<TextField, LocaleKey>> = {
    year: "shelf_details_year_invalid",
    isbn: "shelf_details_isbn_invalid",
};

/** How long the check stays before it fades by itself (FR-15). */
export const CHECK_MS = 1200;

/** Where the path goes in *Saved in {0}*, whatever the language puts around it. */
const SLOT = "\u0001";

/** The writes the section makes, injectable so a test can watch them without a vault. */
export interface DetailsPort {
    create(request: CreateBookNote): Promise<BookNoteWrite>;
    edit(file: TFile, change: BookChange): Promise<BookNoteWrite>;
    adopt(file: TFile, source: string): Promise<BookNoteWrite>;
    /** An article's own frontmatter (#744): only its status and collections. */
    editArticle?(file: TFile, change: BookChange): Promise<BookNoteWrite>;
    undo(batch: string): Promise<UndoResult>;
    noteAt(path: string): TFile | null;
}

export const realDetailsPort: DetailsPort = {
    create: createBookNote,
    edit: editBookNote,
    adopt: adoptNote,
    editArticle,
    undo: undoBatch,
    noteAt,
};

/** A list of choices under an input: what it offers for a query, how each reads, what choosing does. */
export type Suggest = <T>(input: HTMLInputElement, choices: (query: string) => T[], label: (choice: T) => string, chosen: (choice: T) => void) => void;

export interface DetailsParts {
    app: App;
    scope: Component;
    item: ShelfItem;
    /** The Book notes folder, as the setting holds it now. */
    folder: () => string;
    /** Every collection in use, for *+ Collection* to suggest. */
    collections: () => string[];
    /** What the file declares, read only when its note is created. */
    declared: () => Promise<DeclaredMetadata>;
    /** After a write (or its undo): what the note says now, and where it is. */
    saved: (details: BookDetails, note: string | null) => void;
    port?: DetailsPort;
    /** The suggest under an input; Obsidian's own unless a test hands one in. */
    suggest?: Suggest;
}

/** Obsidian's suggest, fed by a function. */
class ChoiceSuggest<T> extends AbstractInputSuggest<T> {
    constructor(
        app: App,
        private readonly input: HTMLInputElement,
        private readonly choices: (query: string) => T[],
        private readonly label: (choice: T) => string,
        private readonly chosen: (choice: T) => void
    ) {
        super(app, input);
    }
    getSuggestions(query: string): T[] {
        return this.choices(query);
    }
    renderSuggestion(choice: T, el: HTMLElement): void {
        el.setText(this.label(choice));
    }
    selectSuggestion(choice: T): void {
        this.input.value = this.label(choice);
        this.close();
        this.chosen(choice);
    }
}

/** Apply a change to what the section holds: a value sets a field, `null` takes it away. */
function applied(base: BookDetails, change: BookChange): BookDetails {
    const next: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(change)) {
        if (value === null || value === undefined) delete next[key];
        else next[key] = value;
    }
    return next;
}

/**
 * **Details** (#743 FR-8, epic #742): a book's note, edited where you already look at the book.
 *
 * The fields are inline inputs, already where their values are (FR-14): nothing moves when you go
 * into one. A change is saved when you leave the field or press Enter — the first one creates the
 * note, every later one edits only what changed — and it is felt, not announced: a small check beside
 * the field fades in and out by itself (FR-15). A failure keeps your text and says so on the spot.
 * Never a modal, never a toast: the Undo for the last write sits on the *Saved in* line for as long
 * as the plugin's undo offers live.
 */
export function renderDetails(parent: HTMLElement, parts: DetailsParts): void {
    const { item, scope, app } = parts;
    const port = parts.port ?? realDetailsPort;
    const suggest: Suggest = parts.suggest ?? ((input, choices, label, chosen) => void new ChoiceSuggest(app, input, choices, label, chosen));
    const source = item.file;
    if (!source || item.kind === "path") return;
    // An article is its own note (#744 FR-4): its status and collections are written into it, and
    // nothing else — no fields to type, no book's note to make or adopt.
    const article = item.kind === "article";
    const edit = (target: TFile, change: BookChange): Promise<BookNoteWrite> =>
        article ? (port.editArticle ? port.editArticle(target, change) : editArticle(target, change)) : port.edit(target, change);

    let details: BookDetails = item.details ? { ...item.details } : {};
    let file: TFile | null = item.note ? port.noteAt(item.note) : null;
    let notePath: string | null = file ? file.path : null;
    /** The last write, and what was there before it — what its Undo puts back. */
    let last: { batch: string; kind: "created" | "edited" | "adopted"; before: BookDetails; at: number } | null = null;
    let chain: Promise<unknown> = Promise.resolve();

    const section = parent.createDiv({ cls: c("shelf-details") });

    /** What a field shows: the note's value, or before there is a note, what the shelf knows. */
    const shown = (field: TextField): string => {
        if (notePath) return fieldText(details, field);
        if (field === "title") return details.title ?? item.title;
        if (field === "author") return details.author ? fieldText(details, "author") : (item.author ?? "");
        return fieldText(details, field);
    };

    const later = (ms: number, fn: () => void) => {
        const id = window.setTimeout(fn, ms);
        scope.register(() => window.clearTimeout(id));
    };

    /** The check (FR-15): opacity only, `fast` in, out by itself after 1.2 s; there under reduced motion too. */
    const settle = (check: HTMLElement) => {
        check.addClass(c("shelf-details-check--on"));
        const moving = motionWelcome(check);
        if (moving) check.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
        later(CHECK_MS, () => {
            if (!moving || !motionWelcome(check)) {
                check.removeClass(c("shelf-details-check--on"));
                return;
            }
            const out = check.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, easing: MOTION.ease });
            out.onfinish = () => check.removeClass(c("shelf-details-check--on"));
        });
    };
    const checkIn = (host: HTMLElement) =>
        host.createSpan({ cls: c("shelf-details-check"), attr: { "aria-label": t("shelf_details_saved"), role: "img" } });

    let errorEl: HTMLElement | null = null;
    const say = (text: string | null) => {
        errorEl?.setText(text ?? "");
        errorEl?.toggleClass(c("shelf-details-error--on"), text !== null);
    };

    /** One write, after the one before it: two quick changes never make two notes. */
    const save = (change: BookChange, check: HTMLElement): Promise<boolean> => {
        const run = async (): Promise<boolean> => {
            const before = { ...details };
            const wasNew = !file;
            try {
                let write: BookNoteWrite;
                if (!file) {
                    write = await port.create({
                        source,
                        folder: parts.folder(),
                        title: details.title ?? item.title,
                        change,
                        declared: parts.declared,
                    });
                    details = readBookNote(write.fields ?? {});
                } else {
                    write = await edit(file, change);
                    details = applied(details, change);
                }
                file = write.file;
                notePath = write.file.path;
                last = write.batch ? { batch: write.batch, kind: wasNew ? "created" : "edited", before, at: Date.now() } : null;
            } catch (error) {
                log.error(`[Library] could not save the note of ${source}: ${String(error)}`);
                say(t("shelf_details_save_failed"));
                return false;
            }
            say(null);
            settle(check);
            if (wasNew) refill(false);
            drawWhere();
            parts.saved(details, notePath);
            return true;
        };
        const next = chain.then(run, run);
        chain = next.catch(() => undefined);
        return next;
    };

    // ── the fields ───────────────────────────────────────────────────────────
    const inputs = new Map<TextField, { input: HTMLInputElement; committed: string }>();
    /** Show what the note holds — in every field, or (after a creation) only in those you are not typing in. */
    const refill = (all: boolean) => {
        for (const [field, entry] of inputs) {
            if (!all && entry.input.value !== entry.committed) continue;
            entry.committed = shown(field);
            entry.input.value = entry.committed;
            entry.input.removeAttribute("aria-invalid");
        }
    };

    section.createEl("h3", { cls: c("shelf-section"), text: t("shelf_details") });
    const grid = section.createDiv({ cls: c("shelf-details-grid") });
    for (const field of article ? [] : TEXT_FIELDS) {
        const id = `zf-book-${field}`;
        grid.createEl("label", { cls: c("shelf-details-label"), text: t(FIELD_KEY[field]), attr: { for: id } });
        const cell = grid.createDiv({ cls: c("shelf-details-cell") });
        const input = cell.createEl("input", {
            cls: c("shelf-details-input"),
            attr: {
                id,
                type: "text",
                spellcheck: "false",
                ...(field === "year" ? { inputmode: "numeric" } : {}),
                ...(field === "author" ? { placeholder: t("shelf_details_author_hint") } : {}),
            },
        });
        const check = checkIn(cell);
        const entry = { input, committed: shown(field) };
        input.value = entry.committed;
        inputs.set(field, entry);
        let inflight: string | null = null;
        const commit = () => {
            const value = input.value;
            if (value === entry.committed || value === inflight) return;
            const change = parseField(field, value);
            if (!change) {
                input.setAttribute("aria-invalid", "true");
                say(t(INVALID_KEY[field] ?? "shelf_details_save_failed"));
                return;
            }
            input.removeAttribute("aria-invalid");
            inflight = value;
            void save(change, check).then((ok) => {
                inflight = null;
                if (ok) entry.committed = value;
            });
        };
        scope.registerDomEvent(input, "blur", commit);
        scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault();
                commit();
            }
        });
    }

    // ── the status ───────────────────────────────────────────────────────────
    grid.createEl("label", { cls: c("shelf-details-label"), text: t("shelf_details_status"), attr: { for: "zf-book-status" } });
    const statusCell = grid.createDiv({ cls: c("shelf-details-cell") });
    const select = statusCell.createEl("select", { cls: ["dropdown", c("shelf-details-status")], attr: { id: "zf-book-status" } });
    const statusCheck = checkIn(statusCell);
    /**
     * The one you set. While you have set none, the first choice says what is read from your reading
     * (*Finished, from your reading*) — so choosing *Finished* is still a choice, and sets it (FR-3).
     */
    const currentStatus = (): string => details.status ?? "";
    const drawStatus = () => {
        select.empty();
        const current = currentStatus();
        const read = item.details?.status ? undefined : item.status;
        if (!current) {
            const text = read ? t("shelf_status_read_as", t(STATUS_KEY[read])) : t("shelf_status_unset");
            select.createEl("option", { text, attr: { value: "" } });
        }
        for (const status of BOOK_STATUSES) select.createEl("option", { text: t(STATUS_KEY[status]), attr: { value: status } });
        select.value = current;
    };
    drawStatus();
    scope.registerDomEvent(select, "change", () => {
        const value = select.value;
        if (!isBookStatus(value) || value === details.status) return;
        void save({ status: value }, statusCheck).then((ok) => {
            if (ok) drawStatus();
            else select.value = currentStatus();
        });
    });

    // ── the collections ──────────────────────────────────────────────────────
    const collectionsHead = section.createDiv({ cls: [c("shelf-details-label"), c("shelf-details-collections-head")] });
    collectionsHead.createSpan({ text: t("shelf_details_collections") });
    const collectionsCheck = checkIn(collectionsHead);
    const chips = section.createDiv({ cls: c("shelf-details-chips") });
    const drawChips = (arrived?: string) => {
        chips.empty();
        for (const name of details.collections ?? []) {
            const chip = chips.createSpan({ cls: c("shelf-details-chip") });
            chip.createSpan({ cls: c("shelf-details-chip-name"), text: name });
            const remove = chip.createEl("button", {
                cls: ["clickable-icon", c("shelf-details-chip-remove")],
                text: "×",
                attr: { type: "button", "aria-label": t("shelf_details_remove_collection", name) },
            });
            scope.registerDomEvent(remove, "click", () => {
                const rest = (details.collections ?? []).filter((other) => other !== name);
                void save({ collections: rest.length > 0 ? rest : null }, collectionsCheck).then((ok) => ok && drawChips());
            });
            if (name === arrived) dropIn(chip);
        }
        const add = chips.createEl("button", { cls: c("shelf-details-add"), text: t("shelf_details_add_collection"), attr: { type: "button" } });
        scope.registerDomEvent(add, "click", () => openAdd(add));
    };
    const openAdd = (add: HTMLElement) => {
        add.remove();
        const input = chips.createEl("input", {
            cls: c("shelf-details-add-input"),
            attr: { type: "text", placeholder: t("shelf_details_collection_placeholder"), "aria-label": t("shelf_details_collections") },
        });
        input.focus();
        let taken = false;
        const done = (name: string) => {
            if (taken) return;
            taken = true;
            const clean = name.replace(/\s+/g, " ").trim();
            const current = details.collections ?? [];
            if (!clean || current.some((other) => fold(other) === fold(clean))) {
                drawChips();
                return;
            }
            void save({ collections: [...current, clean] }, collectionsCheck).then((ok) => (ok ? drawChips(clean) : drawChips()));
        };
        suggest<string>(
            input,
            (query) => parts.collections().filter((name) => fold(name).includes(fold(query)) && !(details.collections ?? []).includes(name)),
            (name) => name,
            (name) => done(name)
        );
        scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault();
                done(input.value);
            } else if (event.key === "Escape") {
                event.preventDefault();
                taken = true;
                drawChips();
            }
        });
        scope.registerDomEvent(input, "blur", () => {
            if (taken || input.value.trim()) return;
            taken = true;
            drawChips();
        });
    };
    drawChips();

    errorEl = section.createDiv({ cls: c("shelf-details-error"), attr: { role: "status" } });

    // ── where it is kept ─────────────────────────────────────────────────────
    const where = section.createDiv({ cls: c("shelf-details-where") });
    let whereCheck: HTMLElement | null = null;
    const drawWhere = () => {
        where.empty();
        whereCheck = null;
        if (!notePath) {
            where.createSpan({ text: t("shelf_details_not_yet", parts.folder()) });
            const adoptButton = where.createEl("button", { cls: c("shelf-details-adopt"), text: t("shelf_details_adopt"), attr: { type: "button" } });
            scope.registerDomEvent(adoptButton, "click", () => openAdopt(adoptButton));
            return;
        }
        const [lead, tail] = t("shelf_details_saved_in", SLOT).split(SLOT);
        if (lead) where.createSpan({ text: lead });
        const path = notePath;
        const link = where.createEl("a", { cls: c("shelf-details-note"), text: path, attr: { href: "#" } });
        hoverPreview(app, link, path, scope);
        scope.registerDomEvent(link, "click", (event: MouseEvent) => {
            event.preventDefault();
            void app.workspace.openLinkText(path, "", false);
        });
        if (tail) where.createSpan({ text: tail });
        whereCheck = checkIn(where);
        const undo = last;
        if (!undo || Date.now() - undo.at >= UNDO_OFFER_MS) return;
        const button = where.createEl("button", { cls: c("shelf-details-undo"), text: t("changes_undo"), attr: { type: "button" } });
        scope.registerDomEvent(button, "click", () => void takeBack(undo));
        later(UNDO_OFFER_MS - (Date.now() - undo.at), () => button.remove());
    };

    const openAdopt = (button: HTMLElement) => {
        button.remove();
        const input = where.createEl("input", {
            cls: c("shelf-details-add-input"),
            attr: { type: "text", placeholder: t("shelf_details_adopt_placeholder"), "aria-label": t("shelf_details_adopt") },
        });
        input.focus();
        suggest<TFile>(
            input,
            (query) =>
                app.vault
                    .getMarkdownFiles()
                    .filter((note) => fold(note.path).includes(fold(query)))
                    .slice(0, 30),
            (note) => note.path,
            (note) => void adopt(note)
        );
        scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            drawWhere();
        });
    };

    /** *Use a note you already have* (FR-7): the link is added, and the section shows what the note says. */
    const adopt = async (note: TFile) => {
        const before = { ...details };
        try {
            const write = await port.adopt(note, source);
            file = note;
            notePath = note.path;
            details = readBookNote(app.metadataCache.getFileCache(note)?.frontmatter);
            last = write.batch ? { batch: write.batch, kind: "adopted", before, at: Date.now() } : null;
        } catch (error) {
            log.error(`[Library] could not use ${note.path} as the note of ${source}: ${String(error)}`);
            say(t("shelf_details_save_failed"));
            drawWhere();
            return;
        }
        say(null);
        redraw();
        if (whereCheck) settle(whereCheck);
        parts.saved(details, notePath);
    };

    /** The last write, taken back where it was made. */
    const takeBack = async (undo: NonNullable<typeof last>) => {
        let result: UndoResult;
        try {
            result = await port.undo(undo.batch);
        } catch {
            result = { hadWork: true, done: 0, failed: [undo.batch] };
        }
        if (!result.hadWork || result.failed.length > 0) {
            say(t("shelf_details_save_failed"));
            return;
        }
        last = null;
        details = undo.before;
        // A note made or adopted, taken back, is no longer this book's note.
        if (undo.kind !== "edited") {
            file = null;
            notePath = null;
        }
        redraw();
        say(t("shelf_details_undone"));
        parts.saved(details, notePath);
    };

    /** Everything again, in place, from what the section holds: after an adoption or an undo. */
    const redraw = () => {
        refill(true);
        drawStatus();
        drawChips();
        drawWhere();
    };

    drawWhere();
}

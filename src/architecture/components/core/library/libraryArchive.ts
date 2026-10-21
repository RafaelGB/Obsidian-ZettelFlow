import { moment as obsidianMoment, setIcon, type Component } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { DRAWERS, drawerCards, drawerCounts, folderOf, type ArchiveRecords, type Drawer } from "application/library/archive";
import type { ShelfItem } from "application/library/shelf";

/**
 * **The archive's cabinet** (#865 FR-15, FR-19, FR-21) — render only. A filing cabinet at the end of
 * the stacks, three drawers with what each holds; a drawer opened unfolds below it, in the same view,
 * into index cards. Nothing here decides or writes: the Library hands the model and the hooks.
 */

type LocaleKey = Parameters<typeof t>[0];
const moment = obsidianMoment as unknown as typeof MomentFn;

const DRAWER_NAME: Record<Drawer, LocaleKey> = { books: "shelf_filter_books", papers: "shelf_filter_papers", articles: "shelf_filter_articles" };
const DRAWER_EMPTY: Record<Drawer, LocaleKey> = { books: "shelf_archive_empty_books", papers: "shelf_archive_empty_papers", articles: "shelf_archive_empty_articles" };
const FORMAT: Record<ShelfItem["format"], string> = { pdf: "PDF", epub: "EPUB", article: "WEB", path: "" };

/** A line by the cabinet or in the drawer: what was done, and its Undo. */
export interface ArchiveLine {
    text: string;
    failed?: boolean;
    undo?: () => void;
}

export interface CabinetModel {
    archived: readonly ShelfItem[];
    records: ArchiveRecords;
    folder: string;
    /** The drawer pulled out, and its own search. */
    open: { drawer: Drawer; search: string } | null;
    /** Whether an article has a shelf to go back to. */
    articlesOn: boolean;
    line: ArchiveLine | null;
    drawerLine: ArchiveLine | null;
}

export interface CabinetHooks {
    /** A drawer was clicked: pulled out, or pushed back when it is the one out. */
    toggle(drawer: Drawer): void;
    close(): void;
    /** The drawer's search changed: only its cards are drawn again. */
    search(text: string): void;
    returnItem(item: ShelfItem, card: HTMLElement): void;
    open(item: ShelfItem, from: HTMLElement): void;
}

function renderLine(parent: HTMLElement, line: ArchiveLine | null, scope: Component): void {
    if (!line) return;
    const el = parent.createDiv({ cls: [c("shelf-archive-line"), ...(line.failed ? [c("shelf-archive-line--failed")] : [])], attr: { role: "status" } });
    el.createSpan({ text: line.text });
    if (!line.undo) return;
    const undo = el.createEl("button", { cls: c("shelf-message-undo"), attr: { type: "button" }, text: t("changes_undo") });
    const action = line.undo;
    scope.registerDomEvent(undo, "click", () => action());
}

/** Where a card's thing came from, in one line. */
function cameFrom(item: ShelfItem, records: ArchiveRecords): string {
    const record = item.file ? records[item.file] : undefined;
    if (!record) return t("shelf_archive_origin_unknown");
    const folder = folderOf(record.from);
    return folder ? t("shelf_archive_was_in", folder) : t("shelf_archive_was_in_root");
}

/** One drawer's cards, drawn again on its own when its search changes. */
export function renderCards(host: HTMLElement, model: CabinetModel, hooks: CabinetHooks, scope: Component): void {
    host.empty();
    const open = model.open;
    if (!open) return;
    const cards = drawerCards(model.archived, open.drawer, open.search, model.records);
    if (cards.length === 0) {
        const empty = drawerCounts(model.archived)[open.drawer] === 0;
        host.createDiv({ cls: c("shelf-archive-empty"), text: empty ? t(DRAWER_EMPTY[open.drawer]) : t("shelf_archive_no_card") });
        return;
    }
    const list = host.createDiv({ cls: c("shelf-archive-cards"), attr: { role: "list" } });
    cards.forEach((item, index) => {
        const card = list.createEl("article", { cls: c("shelf-archive-card"), attr: { role: "listitem", "data-zf-card": item.id } });
        card.setCssProps({ "--zf-card-index": String(index) });
        card.createSpan({ cls: c("shelf-archive-card-tab"), text: FORMAT[item.format] });
        card.createEl("h4", { cls: c("shelf-archive-card-title"), text: item.title, attr: { title: item.title } });
        const byline = item.author ?? item.host;
        if (byline) card.createDiv({ cls: c("shelf-archive-card-who"), text: byline });
        const at = item.file ? model.records[item.file]?.at : undefined;
        const meta = [at ? t("shelf_archive_archived_on", moment(at).format("ll")) : "", cameFrom(item, model.records)].filter(Boolean).join(" · ");
        card.createDiv({ cls: c("shelf-archive-card-meta"), text: meta });
        const acts = card.createDiv({ cls: c("shelf-archive-card-actions") });
        if (item.kind === "article" && !model.articlesOn) {
            acts.createSpan({ cls: c("shelf-archive-card-why"), text: t("shelf_archive_articles_off") });
        } else {
            const back = acts.createEl("button", { cls: c("shelf-archive-card-action"), attr: { type: "button" }, text: t("shelf_archive_return") });
            scope.registerDomEvent(back, "click", () => hooks.returnItem(item, card));
        }
        const read = acts.createEl("button", { cls: [c("shelf-archive-card-action"), c("shelf-archive-card-action--quiet")], attr: { type: "button" }, text: t("shelf_archive_open") });
        scope.registerDomEvent(read, "click", () => hooks.open(item, card));
    });
}

/**
 * The cabinet, beside what it holds and the folder it uses; and below it, the drawer that is out.
 * Returns the cabinet — the place a book is dropped and flown into.
 */
export function renderCabinet(host: HTMLElement, model: CabinetModel, hooks: CabinetHooks, scope: Component): HTMLElement {
    const bay = host.createEl("section", { cls: c("shelf-archive"), attr: { "aria-label": t("shelf_archive") } });
    const cabinet = bay.createDiv({ cls: c("shelf-cabinet"), attr: { role: "group", "aria-label": t("shelf_archive_cabinet") } });
    const counts = drawerCounts(model.archived);
    for (const drawer of DRAWERS) {
        const n = counts[drawer];
        const out = model.open?.drawer === drawer;
        const button = cabinet.createEl("button", {
            cls: [c("shelf-drawer"), ...(n === 0 ? [c("shelf-drawer--empty")] : []), ...(out ? ["is-active"] : [])],
            attr: { type: "button", "aria-expanded": String(out), "data-zf-control": `drawer:${drawer}` },
        });
        const holder = button.createSpan({ cls: c("shelf-drawer-holder") });
        holder.createSpan({ cls: c("shelf-drawer-name"), text: t(DRAWER_NAME[drawer]) });
        holder.createEl("small", { cls: c("shelf-drawer-count"), text: n > 0 ? tCount(n, "shelf_archive_items", String(n)) : t("shelf_archive_drawer_empty") });
        button.createSpan({ cls: c("shelf-drawer-pull"), attr: { "aria-hidden": "true" } });
        scope.registerDomEvent(button, "click", () => hooks.toggle(drawer));
    }

    const side = bay.createDiv({ cls: c("shelf-archive-side") });
    side.createEl("h2", { cls: c("shelf-archive-heading"), text: t("shelf_archive") });
    const total = model.archived.length;
    side.createDiv({ cls: c("shelf-archive-count"), text: total > 0 ? tCount(total, "shelf_archive_count", String(total)) : t("shelf_archive_none") });
    side.createDiv({ cls: c("shelf-archive-purpose"), text: t("shelf_archive_purpose") });
    const where = side.createDiv({ cls: c("shelf-archive-folder") });
    setIcon(where.createSpan({ cls: c("shelf-archive-folder-icon"), attr: { "aria-hidden": "true" } }), "folder");
    where.createSpan({ text: t("shelf_archive_uses", model.folder) });
    side.createDiv({ cls: c("shelf-archive-cue"), text: t("shelf_archive_drop_cue"), attr: { "aria-hidden": "true" } });
    renderLine(side, model.line, scope);

    const open = model.open;
    if (open) {
        // The drawer, pulled out under the cabinet: the camera stays, the drawer comes to it (§XVI).
        const tray = bay.createDiv({ cls: c("shelf-archive-tray") });
        const head = tray.createDiv({ cls: c("shelf-archive-tray-head") });
        head.createEl("h3", { cls: c("shelf-archive-tray-title"), text: t("shelf_archive") });
        const chips = head.createDiv({ cls: c("shelf-chip-group"), attr: { role: "group" } });
        for (const drawer of DRAWERS) {
            const on = drawer === open.drawer;
            const chip = chips.createEl("button", {
                cls: [c("shelf-filter"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on), "data-zf-control": `tray:${drawer}` },
            });
            chip.createSpan({ text: t(DRAWER_NAME[drawer]) });
            chip.createSpan({ cls: c("shelf-filter-count"), text: String(counts[drawer]) });
            scope.registerDomEvent(chip, "click", () => {
                if (!on) hooks.toggle(drawer);
            });
        }
        const input = head.createEl("input", {
            cls: c("shelf-archive-search"),
            attr: { type: "search", placeholder: t("shelf_archive_search"), "aria-label": t("shelf_archive_search"), spellcheck: "false", "data-zf-control": "tray:search" },
        });
        input.value = open.search;
        const close = head.createEl("button", { cls: ["clickable-icon", c("shelf-archive-close")], attr: { type: "button", "aria-label": t("shelf_archive_close") } });
        setIcon(close, "x");
        scope.registerDomEvent(close, "click", () => hooks.close());
        renderLine(tray, model.drawerLine, scope);
        const cards = tray.createDiv({ cls: c("shelf-archive-cards-host") });
        scope.registerDomEvent(input, "input", () => {
            hooks.search(input.value);
            renderCards(cards, { ...model, open: { drawer: open.drawer, search: input.value } }, hooks, scope);
        });
        renderCards(cards, model, hooks, scope);
    }
    return cabinet;
}

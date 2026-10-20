import { setIcon, type Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { currentRow, currentSection, entryCount, filterShape, FIND_AT, type ContentsGroup, type ContentsRow, type ContentsSection, type ReadingPosition, type Span } from "./readerContents";

/** How far a chapter is read, as Contents says it (#812 FR-13). */
export type ContentsState = "read" | "part" | "unread";

export interface ContentsHead {
    title: string;
    author?: string;
    /** The cover the Library already drew for this file, or `null`: a plain tile (#861 FR-1). */
    cover: string | null;
    /** What the tile says when there is no cover: the format's name. */
    format: string;
}

/**
 * The head of a book's Contents (#861 FR-1, FR-2): its cover, its title and its author. The panel's
 * actions and its × follow, appended by the caller to `actions`.
 */
export function drawContentsHead(host: HTMLElement, head: ContentsHead): { head: HTMLElement; actions: HTMLElement } {
    const el = host.createDiv({ cls: c("reader-contents-head") });
    const cover = el.createDiv({ cls: [c("reader-contents-cover"), ...(head.cover ? [] : [c("reader-contents-cover--tile")])], attr: { "aria-hidden": "true" } });
    if (head.cover) cover.createEl("img", { attr: { src: head.cover, alt: "" } });
    else cover.createSpan({ text: head.format });
    const who = el.createDiv({ cls: c("reader-contents-who") });
    who.createDiv({ cls: c("reader-contents-title"), text: head.title });
    if (head.author) who.createDiv({ cls: c("reader-contents-author"), text: head.author });
    const actions = el.createDiv({ cls: c("reader-panel-actions") });
    return { head: el, actions };
}

export interface ContentsList {
    shape: ContentsGroup[];
    /** The chapter on screen. */
    chapter: number;
    /** Where the top of the screen is in a reflowed chapter, for the section you are in. */
    position?: ReadingPosition;
    state(chapter: number): ContentsState;
    /** *You're here*, and the minutes left in the chapter when the bar would say them. */
    here: string;
    /** What is folded and unfolded, kept while the source stays open (FR-7). */
    open: Map<string, boolean>;
    /** Every chapter you marked something in, as known now (FR-14). */
    marked(): ReadonlySet<number>;
    scope: Component;
    jump(chapter: number, fragment?: string): void;
}

/**
 * A book's contents as its shape (#861 FR-5 – FR-17): the *Find* field when the contents are long,
 * then the list. Folding and finding redraw the list alone, in one pass, so the field keeps the
 * focus and the drawer never moves.
 */
export function drawContents(host: HTMLElement, input: ContentsList): HTMLElement {
    let query = "";
    if (entryCount(input.shape) >= FIND_AT) {
        const find = host.createEl("label", { cls: c("reader-contents-find") });
        setIcon(find.createSpan({ cls: c("reader-contents-find-icon"), attr: { "aria-hidden": "true" } }), "search");
        const field = find.createEl("input", { attr: { type: "search", placeholder: t("reader_toc_find"), "aria-label": t("reader_toc_find"), spellcheck: "false" } });
        input.scope.registerDomEvent(field, "input", () => {
            query = field.value;
            draw();
        });
    }
    const list = host.createDiv({ cls: c("reader-toc-list") });
    const here = currentRow(input.shape, input.chapter);
    const hereRow = here ? input.shape[here.group].rows[here.row] : null;
    const isHere = (row: ContentsRow) => !!hereRow && row.chapter === hereRow.chapter && row.title === hereRow.title && row.fragment === hereRow.fragment;
    const hereSection = hereRow ? currentSection(hereRow, input.chapter, input.position) : -1;

    const draw = () => {
        list.empty();
        const groups = filterShape(input.shape, query);
        if (groups.length === 0) {
            list.createDiv({ cls: c("reader-empty"), text: t("reader_toc_find_none", query.trim()) });
            return;
        }
        for (const group of groups) drawGroup(list, group, query !== "", input, isHere, hereSection, draw);
        const marked = input.marked();
        if (marked.size > 0) markContents(list, marked);
    };
    draw();
    // ↑ and ↓ move between the rows and bands on show (FR-17); Enter is the button's own.
    input.scope.registerDomEvent(list, "keydown", (event: KeyboardEvent) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const items = Array.from(list.querySelectorAll<HTMLElement>("button"));
        const at = items.indexOf((event.target as HTMLElement | null)?.closest?.("button") as HTMLElement);
        if (at < 0) return;
        const next = items[Math.min(items.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
        event.preventDefault();
        next.focus();
    });
    return list;
}

function drawGroup(
    list: HTMLElement,
    group: ContentsGroup,
    finding: boolean,
    input: ContentsList,
    isHere: (row: ContentsRow) => boolean,
    hereSection: number,
    redraw: () => void
): void {
    const section = list.createEl("section", { cls: [c("reader-toc-group"), c(`reader-toc-group--${group.kind}`)] });
    const holdsHere = group.rows.some(isHere);
    // A part is open, and front and back matter folded, unless you are in them (FR-7, FR-8).
    const open = group.kind === "loose" || finding || (input.open.get(group.key) ?? (group.kind === "part" || holdsHere));
    if (group.kind !== "loose") {
        const band = section.createEl("button", { cls: c("reader-toc-band"), attr: { type: "button", "aria-expanded": String(open) } });
        setIcon(band.createSpan({ cls: c("reader-toc-band-chevron"), attr: { "aria-hidden": "true" } }), "chevron-right");
        band.createSpan({ cls: c("reader-toc-band-name"), text: group.kind === "part" ? group.title : t(group.kind === "front" ? "reader_toc_front" : "reader_toc_back") });
        band.createSpan({ cls: c("reader-toc-band-rule"), attr: { "aria-hidden": "true" } });
        input.scope.registerDomEvent(band, "click", () => {
            if (finding) return;
            input.open.set(group.key, !open);
            redraw();
        });
    }
    if (!open) return;
    const rows = section.createDiv({ cls: c("reader-toc-rows") });
    group.rows.forEach((row, i) => drawRow(rows, row, `${group.key}/${i}`, finding, input, isHere(row), hereSection, redraw));
}

function drawRow(
    parent: HTMLElement,
    row: ContentsRow,
    key: string,
    finding: boolean,
    input: ContentsList,
    here: boolean,
    hereSection: number,
    redraw: () => void
): void {
    const state = input.state(row.chapter);
    const item = parent.createDiv({ cls: [c("reader-toc-item"), c(`reader-toc-item--${state}`), ...(here ? [c("reader-toc-item--current")] : [])] });
    const button = item.createEl("button", {
        cls: [c("reader-toc-row"), c(`reader-toc-row--${state}`), ...(here ? [c("reader-toc-row--current")] : [])],
        attr: { type: "button", "data-chapter": String(row.chapter) },
    });
    button.createSpan({ cls: [c("reader-toc-state"), c(`reader-toc-state--${state}`)], attr: { "aria-hidden": "true" } });
    button.createSpan({ cls: c("reader-toc-num"), text: row.num });
    titled(button.createSpan({ cls: c("reader-toc-name") }), row.title, row.hit);
    const loc = button.createSpan({ cls: c("reader-toc-loc") });
    if (row.locator) loc.createSpan({ cls: c("reader-toc-page"), text: row.locator });
    if (here) {
        button.createSpan({ cls: c("reader-toc-here"), text: input.here });
        button.setAttribute("aria-current", "step");
    }
    const name = row.num ? `${row.num} ${row.title}` : row.title;
    button.setAttribute("aria-label", `${name} · ${t(STATE_KEY[state])}`);
    input.scope.registerDomEvent(button, "click", () => input.jump(row.chapter, row.fragment));
    if (row.sections.length === 0) return;
    // Sections are folded, except under the chapter you are in (FR-11).
    const open = finding || (input.open.get(key) ?? here);
    const caret = item.createEl("button", {
        cls: ["clickable-icon", c("reader-toc-caret")],
        attr: { type: "button", "aria-expanded": String(open), "aria-label": t(open ? "reader_toc_fold" : "reader_toc_unfold") },
    });
    setIcon(caret, "chevron-right");
    input.scope.registerDomEvent(caret, "click", () => {
        if (finding) return;
        input.open.set(key, !open);
        redraw();
    });
    if (!open) return;
    const list = item.createDiv({ cls: c("reader-toc-sections") });
    row.sections.forEach((section, i) => drawSection(list, section, here && i === hereSection, input));
}

function drawSection(parent: HTMLElement, section: ContentsSection, here: boolean, input: ContentsList): void {
    const button = parent.createEl("button", {
        cls: [c("reader-toc-section"), ...(here ? [c("reader-toc-section--current")] : [])],
        attr: { type: "button" },
    });
    titled(button.createSpan({ cls: c("reader-toc-section-name") }), section.num ? `${section.num} ${section.title}` : section.title, section.hit && section.num ? shift(section.hit, section.num.length + 1) : section.hit);
    if (section.locator) button.createSpan({ cls: c("reader-toc-page"), text: section.locator });
    if (here) button.setAttribute("aria-current", "location");
    input.scope.registerDomEvent(button, "click", () => input.jump(section.chapter, section.fragment));
}

const shift = (span: Span, by: number): Span => [span[0] + by, span[1] + by];

/** A title, its match marked (FR-16). */
function titled(el: HTMLElement, text: string, hit?: Span): void {
    if (!hit) {
        el.setText(text);
        return;
    }
    if (hit[0] > 0) el.createSpan({ text: text.slice(0, hit[0]) });
    el.createEl("mark", { cls: c("reader-toc-hit"), text: text.slice(hit[0], hit[1]) });
    if (hit[1] < text.length) el.createSpan({ text: text.slice(hit[1]) });
}

const STATE_KEY: Record<ContentsState, "reader_toc_read" | "reader_toc_part" | "reader_toc_unread"> = {
    read: "reader_toc_read",
    part: "reader_toc_part",
    unread: "reader_toc_unread",
};

/** The rows of chapters you marked something in get their one mark, beside the page (#812 FR-14). */
export function markContents(host: HTMLElement, marked: ReadonlySet<number>): void {
    for (const row of Array.from(host.querySelectorAll<HTMLElement>("[data-chapter]"))) {
        if (!marked.has(Number(row.getAttribute("data-chapter"))) || row.querySelector(`.${c("reader-toc-mark")}`)) continue;
        const loc = row.querySelector<HTMLElement>(`.${c("reader-toc-loc")}`) ?? row;
        loc.prepend(loc.createSpan({ cls: c("reader-toc-mark"), attr: { "aria-hidden": "true" } }));
        row.setAttribute("aria-label", `${row.getAttribute("aria-label") ?? ""} · ${t("reader_toc_marked")}`);
    }
}

import { setIcon, setTooltip } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { LabSource, SourceHead, SpineEntry } from "application/thinking/labSource";
import { SOURCE_ICON } from "./labSourcePicker";
import { LAB_KEY } from "./labSourceShot";

export interface SourceHeadParts {
    /** The author the Library already knows, for a book or a PDF. */
    author?: string;
    /** An object URL for the cover the Library already drew this session — never read for this. */
    cover?: string | null;
    /** The file is no longer there: say so, and offer nothing to open. */
    gone: boolean;
    /** *Open in the Reader*, or *Open the note*, from the button that was pressed. */
    open: (from: HTMLElement) => void;
    listen: (el: HTMLElement, run: () => void) => void;
}

/** What a source is, in a word: a book (by whom), a PDF, or a note (where it lives). */
export function sourceSubLine(source: LabSource, author?: string): string {
    if (source.kind === "note") {
        const folder = source.path.includes("/") ? source.path.slice(0, source.path.lastIndexOf("/")) : "";
        return folder || "/";
    }
    const kind = source.kind === "book" ? t("lab_source_kind_book") : t("lab_source_kind_pdf");
    return author ? `${author} · ${kind}` : kind;
}

/**
 * **The source header** (#874 FR-12): with one source picked, what it is — its cover when the Library
 * already drew it, or a plain tile; its name; a word on what it is — and the one way to it. Drawing it
 * never reads the file. Opening the note lives here now, and no longer on every card's from-line.
 */
export function renderSourceHead(host: HTMLElement, source: LabSource, parts: SourceHeadParts): HTMLElement {
    const head = host.createDiv({ cls: c("lab-source-head"), attr: { "data-source": source.path } });
    const tile = head.createDiv({ cls: [c("lab-source-cover"), c(`lab-source-cover--${source.kind}`)].join(" ") });
    if (parts.cover) tile.createEl("img", { attr: { src: parts.cover, alt: "" } });
    else setIcon(tile, SOURCE_ICON[source.kind]);
    const said = head.createDiv({ cls: c("lab-source-said") });
    said.createDiv({ cls: c("lab-source-title"), text: source.name });
    said.createDiv({
        cls: c("lab-source-sub"),
        text: parts.gone ? t("lab_about_gone", source.name) : sourceSubLine(source, parts.author),
    });
    if (parts.gone) return head;
    const open = head.createEl("button", {
        cls: c("lab-source-open"),
        text: source.kind === "note" ? t("lab_about_open") : t("lab_highlight_open_reader"),
        attr: { type: "button" },
    });
    parts.listen(open, () => parts.open(open));
    return head;
}

/**
 * A head in the list, in reading order (#874 FR-10): a source's name between blocks, a place's own
 * label (*Ch. 3 · …*, *p. 42*) between its threads, or the one line for the threads with no place.
 */
export function renderListHead(list: HTMLElement, head: SourceHead, source: LabSource | undefined, author?: string): HTMLElement {
    const key = head.kind === "place" ? `place:${head.source}:${head.label}` : `${head.kind}:${head.source}`;
    if (head.kind === "source") {
        const row = list.createDiv({ cls: [c("lab-list-head"), c("lab-list-head--source")].join(" "), attr: { [LAB_KEY]: `head:${key}` } });
        setIcon(row.createSpan({ cls: c("lab-source-icon") }), SOURCE_ICON[source?.kind ?? "note"]);
        row.createSpan({ cls: c("lab-list-head-name"), text: source?.name ?? head.source });
        if (source) row.createSpan({ cls: c("lab-list-head-sub"), text: sourceSubLine(source, author) });
        return row;
    }
    return list.createDiv({
        cls: c("lab-list-head"),
        text: head.kind === "place" ? head.label : t("lab_source_no_place"),
        attr: { [LAB_KEY]: `head:${key}` },
    });
}

/**
 * **The spine** (#874 FR-13): a rail beside the list with a tick where each thread sits in the book or
 * the PDF — where you thought, and how close together, with **no number anywhere**. A tick is a control
 * named by its place; pressing it brings its card into view.
 */
export function renderSpine(
    host: HTMLElement,
    entries: readonly SpineEntry[],
    parts: { name: string; tick: (id: string) => void; listen: (el: HTMLElement, run: () => void) => void }
): HTMLElement {
    const rail = host.createDiv({ cls: c("lab-spine"), attr: { role: "group", "aria-label": t("lab_source_spine", parts.name) } });
    const line = rail.createDiv({ cls: c("lab-spine-line") });
    for (const entry of entries) {
        const tick = line.createEl("button", {
            cls: c("lab-spine-tick"),
            attr: { type: "button", "aria-label": entry.label, "data-thread": entry.id },
        });
        // Placed by a custom property the stylesheet reads — never an inline style.
        tick.setCssProps({ "--zf-spine-at": `${Math.round(entry.share * 10000) / 100}%` });
        setTooltip(tick, entry.label);
        parts.listen(tick, () => parts.tick(entry.id));
    }
    return rail;
}

import { setIcon, type Component } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { HIGHLIGHT_MEANINGS, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { touchPointer } from "./readerDevice";

/**
 * **The overview** (#776, epic #742): every page of a book or a paper as a card — the reMarkable's
 * page overview, in the Reader. A PDF page and a designed EPUB page are each a small picture of the
 * page; a flowing EPUB chapter is one card, its page's start drawn in your type (D1–D4, D11). Your
 * marks sit on the cards and are never counted (D9); a chapter's progress is a hairline, never a
 * percentage (D10). It was #767's *Pages* tab (`readerThumbs`), grown to every source: one component,
 * one name, one motion (D5, D7).
 *
 * The rules are pure functions, tested without a DOM. The grid draws a card only once it comes into
 * view — through the drawer the Reader hands it — and lets the farthest go past a named cap (FR-17).
 * It writes nothing (FR-19): what a pick does is the Reader's.
 */

/** A card's width, in CSS pixels: three to the panel's row (#767's thumbnail). */
export const CARD_WIDTH = 96;
/** A card's picture is never drawn denser than this, whatever the screen (FR-18). */
export const CARD_DPR_MAX = 2;
/** A flowing chapter's preview keeps this many blocks of its start, and lets the rest go (P1 of the plan). */
export const PREVIEW_BLOCKS = 12;
/**
 * How many card pictures are held at once (FR-17, D16): on a phone or an iPad, WKWebView counts every
 * canvas and every drawn chapter; a desktop has room. Provisional until the device walk (P16).
 */
export const OVERVIEW_LIMITS = {
    mobile: { pictures: 24, previews: 12 },
    desktop: { pictures: 96, previews: 24 },
} as const;
/** How far beyond the panel's edge a card is drawn before it scrolls in. */
const NEAR_MARGIN = "200px 0px";
/** Two fingers spreading by this share on a card push into it (FR-23). */
const SPREAD_TO_PICK = 1.25;

export type CardKind = "page" | "chapter";

/** One card: which part of the book it is, how it is drawn, what it is called. */
export interface OverviewUnit {
    index: number;
    kind: CardKind;
    label: string;
}

/** What the units are read from: the source as the Reader knows it. */
export interface OverviewBook {
    format: string;
    /** A wholly designed book (#771): every part is a page. */
    designed?: boolean;
    direction?: "ltr" | "rtl";
    chapters: readonly { label: string; section?: string; designed?: true }[];
    toc?: readonly { title: string; chapter: number; depth: number }[];
}

/**
 * The cards, in reading order (FR-8, D1–D4): a PDF's pages and a designed book's pages are page
 * cards; a flowing book's spine items are chapter cards; a book mixing the two shows each as itself.
 * A chapter is named as Contents names it — its shallowest entry — else by its section or its label.
 */
export function overviewUnits(book: OverviewBook): { units: OverviewUnit[]; rtl: boolean } {
    const names = new Map<number, { title: string; depth: number }>();
    for (const entry of book.toc ?? []) {
        const known = names.get(entry.chapter);
        if (entry.title.trim() && (!known || entry.depth < known.depth)) names.set(entry.chapter, { title: entry.title.trim(), depth: entry.depth });
    }
    const units = book.chapters.map((chapter, index): OverviewUnit => {
        const page = book.format === "pdf" || book.designed === true || chapter.designed === true;
        if (page) return { index, kind: "page", label: chapter.label };
        return { index, kind: "chapter", label: names.get(index)?.title ?? chapter.section ?? chapter.label };
    });
    return { units, rtl: book.direction === "rtl" };
}

/** A mark the Reader keeps about a part of the book: a highlight, an ink note. */
export interface MarkSource {
    /** The part of the book it is in (a thought's `locator.at`). */
    at: number;
    meaning?: HighlightMeaning;
    ink?: boolean;
    /** The words it marks, to place its tick when the card's text is known (P2). */
    quote?: string;
}

/** A tick on a card's edge: its meaning's colour, at its share of the card — or at the edge, unknown. */
export interface CardTick {
    meaning: HighlightMeaning;
    at: number | null;
}

export interface CardMarks {
    ticks: CardTick[];
    pen: boolean;
    ribbon: boolean;
}

/** Places closer than this share of a card are one place: two highlights there make one tick. */
const SAME_PLACE = 0.02;

/**
 * The marks inside a card, never counted (D9, FR-9): one tick per distinct place and colour — at its
 * place along the card when the card's text is known, one per colour at the edge when it is not (P2);
 * a pen mark when there is ink; the ribbon when there is a bookmark.
 */
export function cardMarks(marks: readonly MarkSource[], bookmarks: readonly { chapter: number }[], index: number, text?: string): CardMarks {
    const mine = marks.filter((mark) => mark.at === index);
    const ticks: CardTick[] = [];
    const hay = text ? fold(text) : "";
    for (const mark of mine) {
        if (mark.ink) continue;
        const meaning = mark.meaning ?? "idea";
        let at: number | null = null;
        if (hay && mark.quote) {
            const found = hay.indexOf(fold(mark.quote));
            if (found >= 0) at = Math.round((found / Math.max(1, hay.length)) * 1000) / 1000;
        }
        const same = ticks.some((tick) => tick.meaning === meaning && (tick.at === null || at === null ? tick.at === at : Math.abs(tick.at - at) < SAME_PLACE));
        if (!same) ticks.push({ meaning, at });
    }
    ticks.sort((a, b) => HIGHLIGHT_MEANINGS.indexOf(a.meaning) - HIGHLIGHT_MEANINGS.indexOf(b.meaning) || (a.at ?? -1) - (b.at ?? -1));
    return { ticks, pen: mine.some((mark) => mark.ink), ribbon: bookmarks.some((bookmark) => bookmark.chapter === index) };
}

/** Whitespace folded and case ignored: a quote is found in a card's text however it wraps. */
function fold(text: string): string {
    return text.replace(/\s+/g, " ").toLowerCase();
}

/**
 * A chapter card's hairline (D10): filled to your place in the chapter you are reading, filled in a
 * chapter you read to its end, empty in any other. A page has none — a page is too small a unit.
 */
export function cardProgress(unit: OverviewUnit, current: number, share: number, read: ReadonlySet<number>): number | null {
    if (unit.kind === "page") return null;
    if (unit.index === current) return Math.round(Math.min(1, Math.max(0, share)) * 1000) / 1000;
    return read.has(unit.index) ? 1 : 0;
}

/** A card's picture, in device pixels: the card's size at the screen's density, capped (FR-18). */
export function cardPixels(width: number, height: number, dpr: number): { width: number; height: number } {
    const density = Math.min(CARD_DPR_MAX, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
    return { width: Math.ceil(width * density), height: Math.ceil(height * density) };
}

/**
 * Past the cap, the pictures to let go: the farthest from the cards in view, first (FR-17). A card in
 * view is never let go — a sheet you are looking at going blank would be worse than a picture more.
 */
export function releaseFarthest(held: readonly number[], cap: number, near: number, inView: ReadonlySet<number> = new Set()): number[] {
    const over = held.length - Math.max(0, cap);
    if (over <= 0) return [];
    return held
        .filter((index) => !inView.has(index))
        .sort((a, b) => Math.abs(b - near) - Math.abs(a - near) || b - a)
        .slice(0, over);
}

export type ContentsTab = "contents" | "overview" | "bookmarks" | "trail";
const CONTENTS_TAB_IDS: readonly ContentsTab[] = ["contents", "overview", "bookmarks", "trail"];

/** A tab id as it was kept: #767's *Pages* is the overview now (D7, AC-2); anything else, Contents. */
export function normalizeContentsTab(raw: unknown): ContentsTab {
    if (raw === "pages") return "overview";
    return CONTENTS_TAB_IDS.includes(raw as ContentsTab) ? (raw as ContentsTab) : "contents";
}

/** The cap on pictures held, on this device (D16). */
export function overviewLimit(mobile: boolean): number {
    return (mobile ? OVERVIEW_LIMITS.mobile : OVERVIEW_LIMITS.desktop).pictures;
}

// ── the grid ─────────────────────────────────────────────────────────────

export interface OverviewOptions {
    units: readonly OverviewUnit[];
    rtl?: boolean;
    current: number;
    /** The card's shape, height over width, so a card not drawn yet is already its paper (FR-10). */
    ratio(index: number): number;
    /**
     * Draw card `index` into `picture`, `width` CSS pixels wide; `done` once it is drawn (with the
     * card's text, when it has some), `fail` when it cannot be. Returns its let-go — before it is drawn
     * (it scrolled past), or after (released past the cap, or the overview closed).
     */
    draw(index: number, picture: HTMLElement, width: number, done: (text?: string) => void, fail: (error: unknown) => void): () => void;
    marks(index: number, text?: string): CardMarks;
    progress(index: number): number | null;
    onPick(index: number, sheet: HTMLElement): void;
    /** How many pictures are held at once (FR-17). */
    limit: number;
    /** A first drawing fades in (FR-24); never under reduced motion (FR-28). */
    fade: boolean;
}

export interface Overview {
    setCurrent(index: number): void;
    /** The card's sheet — where a picture sits, where a flight starts and lands. */
    sheetOf(index: number): HTMLElement | null;
    cardOf(index: number): HTMLElement | null;
    /** The cards held drawn right now (for the cap's proof). */
    held(): number[];
    /** The marks were read again: every card's are drawn anew. */
    refreshMarks(): void;
    dispose(): void;
}

const MARK_LABEL: Record<"highlight" | "ink" | "bookmark", Parameters<typeof t>[0]> = {
    highlight: "reader_overview_mark_highlight",
    ink: "reader_overview_mark_ink",
    bookmark: "reader_overview_mark_bookmark",
};

/** Draw the overview's grid into `list`, scoped to `scope` (the panel's). */
export function renderOverview(list: HTMLElement, options: OverviewOptions, scope: Component): Overview {
    const grid = list.createDiv({ cls: c("reader-overview"), attr: { role: "list", ...(options.rtl ? { dir: "rtl" } : {}) } });
    const cards: HTMLElement[] = [];
    const sheets: HTMLElement[] = [];
    const lets = new Map<number, () => void>();
    const pictures = new Map<number, HTMLElement>();
    const drawn = new Set<number>();
    const everDrawn = new Set<number>();
    const failed = new Set<number>();
    /** A drawn card's text, kept so its ticks stay at their place when the marks arrive (P2). */
    const texts = new Map<number, string>();
    let warned = false;
    let current = options.current;
    let near = current;
    /** The cards in view now, as the observer last said: never let go, and where `near` is. */
    const inView = new Set<number>();
    let disposed = false;

    const releaseOne = (index: number) => {
        lets.get(index)?.();
        lets.delete(index);
        const picture = pictures.get(index);
        pictures.delete(index);
        drawn.delete(index);
        if (!picture) return;
        for (const canvas of Array.from(picture.querySelectorAll("canvas"))) {
            canvas.width = 0;
            canvas.height = 0;
        }
        if (picture.tagName === "CANVAS") {
            (picture as HTMLCanvasElement).width = 0;
            (picture as HTMLCanvasElement).height = 0;
        }
        picture.remove();
    };

    const enforceCap = () => {
        for (const index of releaseFarthest([...drawn], options.limit, near, inView)) releaseOne(index);
    };

    const fail = (index: number, error: unknown) => {
        if (disposed) return;
        failed.add(index);
        // The card keeps its paper and its label (FR-11): only its picture goes.
        releaseOne(index);
        if (warned) return;
        warned = true;
        log.warn(`[Reader] a card of the overview could not be drawn (#${index + 1}): ${error instanceof Error ? error.message : String(error)}`);
    };

    const draw = (index: number) => {
        const sheet = sheets[index];
        if (!sheet || disposed || drawn.has(index) || lets.has(index) || failed.has(index)) return;
        const picture = sheet.createDiv({ cls: c("reader-overview-picture") });
        pictures.set(index, picture);
        const width = Math.round(sheet.getBoundingClientRect?.().width || CARD_WIDTH);
        let settled = false;
        try {
            const letGo = options.draw(
                index,
                picture,
                width,
                (text) => {
                    if (settled || disposed || pictures.get(index) !== picture) return;
                    settled = true;
                    drawn.add(index);
                    // The first drawing fades in; a card drawn again after it was let go simply is (FR-24).
                    if (options.fade && !everDrawn.has(index)) picture.addClass(c("reader-overview-picture--drawn"));
                    everDrawn.add(index);
                    if (text) {
                        texts.set(index, text);
                        renderMarks(index, text);
                    }
                    enforceCap();
                },
                (error) => {
                    if (settled) return;
                    settled = true;
                    fail(index, error);
                }
            );
            if (!settled || drawn.has(index)) lets.set(index, letGo);
            else letGo();
        } catch (error) {
            settled = true;
            fail(index, error);
        }
    };

    const renderMarks = (index: number, text?: string) => {
        const sheet = sheets[index];
        const card = cards[index];
        if (!sheet || !card) return;
        for (const old of Array.from(sheet.querySelectorAll(`.${c("reader-overview-marks")}`))) old.remove();
        const marks = options.marks(index, text);
        const names: string[] = [];
        if (marks.ticks.length > 0 || marks.pen || marks.ribbon) {
            const layer = sheet.createDiv({ cls: c("reader-overview-marks") });
            if (marks.ticks.length > 0) {
                const edge = layer.createDiv({ cls: c("reader-overview-ticks"), attr: { role: "img", "aria-label": t(MARK_LABEL.highlight) } });
                marks.ticks.forEach((tick, i) => {
                    const mark = edge.createSpan({ cls: [c("reader-overview-tick"), c(`reader-highlight--${tick.meaning}`), ...(tick.at === null ? [c("reader-overview-tick--edge")] : [])] });
                    mark.setCssProps({ "--zf-tick-at": tick.at === null ? `${i * 8}%` : `${Math.round(tick.at * 1000) / 10}%` });
                });
                names.push(t(MARK_LABEL.highlight));
            }
            if (marks.pen) {
                const pen = layer.createSpan({ cls: c("reader-overview-pen"), attr: { role: "img", "aria-label": t(MARK_LABEL.ink) } });
                setIcon(pen, "pen-line");
                names.push(t(MARK_LABEL.ink));
            }
            if (marks.ribbon) {
                const ribbon = layer.createSpan({ cls: c("reader-overview-ribbon"), attr: { role: "img", "aria-label": t(MARK_LABEL.bookmark) } });
                setIcon(ribbon, "bookmark");
                names.push(t(MARK_LABEL.bookmark));
            }
        }
        card.setAttribute("data-marks", names.join(", "));
        labelCard(index);
    };

    const labelCard = (index: number) => {
        const card = cards[index];
        const unit = options.units[index];
        if (!card || !unit) return;
        const progress = options.progress(index);
        const parts = [unit.label];
        if (index === current) parts.push(t("reader_overview_current"));
        if (unit.kind === "chapter" && index === current) parts.push(t("reader_overview_reading"));
        else if (progress === 1) parts.push(t("reader_overview_read"));
        const marks = card.getAttribute("data-marks");
        if (marks) parts.push(marks);
        card.setAttribute("aria-label", parts.join(", "));
    };

    const win = list.win as unknown as { IntersectionObserver?: typeof IntersectionObserver } | undefined;
    const Observer = win?.IntersectionObserver;
    const observer = Observer
        ? new Observer(
              (entries: IntersectionObserverEntry[]) => {
                  for (const entry of entries) {
                      const index = Number((entry.target as HTMLElement).getAttribute("data-unit"));
                      if (!Number.isInteger(index)) continue;
                      if (entry.isIntersecting) inView.add(index);
                      else inView.delete(index);
                  }
                  // The middle of what is in view: the farthest from it goes first past the cap.
                  if (inView.size > 0) {
                      const seen = [...inView].sort((a, b) => a - b);
                      near = seen[Math.floor(seen.length / 2)];
                  }
                  for (const entry of entries) {
                      const index = Number((entry.target as HTMLElement).getAttribute("data-unit"));
                      if (!Number.isInteger(index)) continue;
                      if (entry.isIntersecting) draw(index);
                      else if (lets.has(index) && !drawn.has(index)) {
                          // Scrolled past before its turn came: let go, asked again if it comes back.
                          releaseOne(index);
                      }
                  }
              },
              { root: list.closest?.(`.${c("reader-panel")}`) ?? null, rootMargin: NEAR_MARGIN }
          )
        : null;

    const focusCard = (index: number) => {
        const target = cards[Math.max(0, Math.min(cards.length - 1, index))];
        if (!target) return;
        for (const card of cards) card.setAttribute("tabindex", card === target ? "0" : "-1");
        target.focus?.();
    };

    options.units.forEach((unit, index) => {
        const isCurrent = index === current;
        const card = grid.createEl("button", {
            cls: [c("reader-overview-card"), c(`reader-overview-card--${unit.kind}`), ...(isCurrent ? ["is-active"] : [])],
            attr: {
                type: "button",
                role: "listitem",
                "data-unit": String(index),
                tabindex: isCurrent ? "0" : "-1",
                ...(isCurrent ? { "aria-current": unit.kind === "page" ? "page" : "step" } : {}),
            },
        });
        const sheet = card.createDiv({ cls: c("reader-overview-sheet") });
        sheet.setCssProps({ "--zf-card-ratio": String(Math.round(options.ratio(index) * 10000) / 10000) });
        const progress = options.progress(index);
        if (progress !== null) {
            const line = card.createDiv({ cls: c("reader-overview-progress"), attr: { "aria-hidden": "true" } });
            line.createSpan({ cls: c("reader-overview-progress-fill") }).setCssProps({ "--zf-card-progress": String(progress) });
        }
        card.createSpan({ cls: c("reader-overview-label"), text: unit.label });
        cards.push(card);
        sheets.push(sheet);
        scope.registerDomEvent(card, "click", () => options.onPick(index, sheet));
        renderMarks(index);
        observer?.observe(card);
    });

    // Tab reaches the current card; the arrows move between cards; Enter goes there (FR-16).
    scope.registerDomEvent(grid, "keydown", (event: KeyboardEvent) => {
        const at = cards.findIndex((card) => card === event.target || card.contains?.(event.target as Node));
        if (at < 0) return;
        const forward = options.rtl ? "ArrowLeft" : "ArrowRight";
        const back = options.rtl ? "ArrowRight" : "ArrowLeft";
        let to: number | null = null;
        if (event.key === forward || event.key === "ArrowDown") to = at + 1;
        else if (event.key === back || event.key === "ArrowUp") to = at - 1;
        else if (event.key === "Home") to = 0;
        else if (event.key === "End") to = cards.length - 1;
        else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            options.onPick(at, sheets[at]);
            return;
        }
        if (to === null) return;
        event.preventDefault();
        focusCard(to);
    });

    // Two fingers spreading on a card push into it (FR-23): the same move as a tap, forwards.
    const fingers = new Map<number, { x0: number; y0: number; x: number; y: number }>();
    let spread0 = 0;
    let picked = false;
    const spread = () => {
        const [a, b] = [...fingers.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    scope.registerDomEvent(grid, "pointerdown", (event: PointerEvent) => {
        if (!touchPointer(event)) return;
        fingers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY });
        if (fingers.size === 2) {
            spread0 = spread();
            picked = false;
        }
    });
    scope.registerDomEvent(grid, "pointermove", (event: PointerEvent) => {
        const finger = fingers.get(event.pointerId);
        if (!finger) return;
        finger.x = event.clientX;
        finger.y = event.clientY;
        if (fingers.size !== 2 || picked || !(spread0 > 0) || spread() / spread0 < SPREAD_TO_PICK) return;
        const target = (event.target as HTMLElement | null)?.closest?.(`.${c("reader-overview-card")}`);
        const at = target ? cards.indexOf(target as HTMLElement) : -1;
        if (at < 0) return;
        picked = true;
        options.onPick(at, sheets[at]);
    });
    const lift = (event: PointerEvent) => {
        fingers.delete(event.pointerId);
    };
    scope.registerDomEvent(grid, "pointerup", lift);
    scope.registerDomEvent(grid, "pointercancel", lift);

    return {
        setCurrent(index: number): void {
            if (index === current || !cards[index]) return;
            const previous = current;
            const was = cards[previous];
            was?.removeClass("is-active");
            was?.removeAttribute("aria-current");
            current = index;
            const now = cards[current];
            now.addClass("is-active");
            now.setAttribute("aria-current", options.units[current]?.kind === "page" ? "page" : "step");
            for (const card of cards) card.setAttribute("tabindex", card === now ? "0" : "-1");
            labelCard(previous);
            labelCard(current);
        },
        sheetOf: (index) => sheets[index] ?? null,
        cardOf: (index) => cards[index] ?? null,
        held: () => [...drawn],
        refreshMarks(): void {
            options.units.forEach((_, index) => renderMarks(index, texts.get(index)));
        },
        dispose(): void {
            disposed = true;
            observer?.disconnect();
            for (const index of [...lets.keys(), ...pictures.keys()]) releaseOne(index);
        },
    };
}

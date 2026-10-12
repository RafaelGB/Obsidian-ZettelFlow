import { Component, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import type { CropBox } from "application/library/pdfCrop";
import { bookNoteFileName } from "application/library/bookNote";
import type { Thought, ThoughtLocator } from "application/thinking/thought";
import type { SourcePageTask } from "architecture/components/core/library/sources/sourceDocument";
import { InquiryNoteSuggest } from "architecture/components/core/cultivate/InquiryNoteSuggest";
import { fly, MOTION, motionWelcome } from "./readerMotion";
import { nextProposalSeq, type ProposalOwner } from "./readerProposal";
import { panelClose } from "./readerPanelHead";
import { saveSnapshot, undoSnapshot, type SnapshotChoice, type SnapshotSaved, type SnapshotToSave } from "./readerSnapshotSave";

/**
 * **Snapshot a figure or a table** (#763, epic #742). In a paper the argument is often a figure, and a
 * figure cannot be highlighted: it is not text. *Snapshot* in Page view's bar turns the next drag into
 * a capture — a mouse, a pen or a finger — and a picture in a book offers *Snapshot this image*.
 *
 * The region is drawn again by pdf.js at twice the size it has on screen (never a copy of the screen),
 * an EPUB's picture keeps its own bytes, and the capture lands in the margin as a card that asks where
 * it goes: a new note, a fleeting note in Think, or a note you already have. **Nothing is written until
 * you choose**, and what a choice writes is one recorded batch (`readerSnapshotSave.ts`, the Reader's
 * named writer): one Undo takes it all back. The book is never written, and a capture is never put on
 * the clipboard.
 *
 * Motion (§XVI): while you drag, only the rectangle is drawn — nothing moves, nothing dims. On release
 * the region lifts (1 → 1.02) and flies to its card, **becoming** the card's picture (`fly`, `land:
 * "become"`): one picture, never a second one fading in. A choice sends it on; Cancel lets it sink.
 * Any input during a flight completes it; under reduced motion nothing animates.
 */

/** A rectangle smaller than this on a side captures nothing (FR-4). */
export const SNAPSHOT_MIN_PX = 20;
/** The longest side a capture may have, in pixels (FR-3). */
export const SNAPSHOT_MAX_SIDE = 4096;
/** The most pixels a capture may hold: an iPad's canvas gives up at about 16.7 million (plan risk). */
export const SNAPSHOT_MAX_AREA = 16_000_000;
/** How much sharper than on screen a region is drawn (FR-3). */
export const SNAPSHOT_FACTOR = 2;
/** How long a status line stays once a choice is made. */
const STATUS_MS = 8000;
/** How long the *Drag around a figure* hint stays. */
const HINT_MS = 2500;
/** How far a cancelled card sinks as it fades, in px: the 4-grid's second step. */
const SINK_PX = 8;

export type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

// ── the pure half ───────────────────────────────────────────────────────────

/** The rectangle two corners span, whichever way the drag went. */
export function normalizeRect(a: Point, b: Point): Box {
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Under 20 CSS px on either side: a tap or a slip, not a figure (FR-4). */
export function tooSmall(rect: { width: number; height: number }): boolean {
    return rect.width < SNAPSHOT_MIN_PX || rect.height < SNAPSHOT_MIN_PX;
}

/**
 * The scale a region is drawn at, in pixels per unit of the page (FR-3, AC-1): twice what it has on
 * screen, then held so its long side is at most 4,096 px and its area at most 16 M px. `size` is the
 * region in the page's own units (a PDF's points).
 */
export function captureScale(onScreen: number, size: { width: number; height: number }): number {
    const want = Math.max(0, onScreen) * SNAPSHOT_FACTOR;
    const long = Math.max(size.width, size.height, 1e-6);
    const area = Math.max(size.width * size.height, 1e-6);
    return Math.min(want, SNAPSHOT_MAX_SIDE / long, Math.sqrt(SNAPSHOT_MAX_AREA / area));
}

/** A rectangle as shares (0–1) of the page box it is drawn over, held inside the page. */
export function regionFractions(rect: Box, page: Box): CropBox {
    const w = Math.max(1e-6, page.width);
    const h = Math.max(1e-6, page.height);
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const x0 = clamp((rect.left - page.left) / w);
    const y0 = clamp((rect.top - page.top) / h);
    const x1 = clamp((rect.left + rect.width - page.left) / w);
    const y1 = clamp((rect.top + rect.height - page.top) / h);
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
}

/** The image's name (FR-6): the source's title, sanitised, and the place — `Cap p. 4`, `Thinking ch. 3`. */
export function snapshotName(title: string, place: string): string {
    return `${bookNoteFileName(title)} ${place.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim()}`.trim();
}

/** *Add note*'s note (FR-5.1): the image, your caption when you wrote one, and the `source::` line. */
export function noteMarkdown(parts: { embed: string; caption: string; citation: string }): string {
    const caption = parts.caption.trim();
    return `${parts.embed}\n\n${caption ? `${caption}\n\n` : ""}source:: ${parts.citation}\n`;
}

/** *Attach to a note* (FR-5.3): what is added at the note's end — the image and its `source::` line. */
export function appendMarkdown(parts: { embed: string; citation: string }): string {
    return `${parts.embed}\nsource:: ${parts.citation}`;
}

/** *Fleeting note* (FR-5.2): the thought's text is the image; its page rides in the thought's place. */
export function fleetingText(parts: { embed: string }): string {
    return parts.embed;
}

/**
 * Draw a region of a page into a scratch canvas (`scratch`, never in the page) and take it as a PNG;
 * the canvas is let go at once (T8).
 */
export async function captureRegion(
    render: (page: number, canvas: HTMLCanvasElement, options: { scale: number; rotation: number; frame?: CropBox }) => SourcePageTask,
    scratch: () => HTMLCanvasElement,
    page: number,
    options: { scale: number; rotation: number; frame?: CropBox }
): Promise<Blob | null> {
    const canvas = scratch();
    try {
        await render(page, canvas, options).promise;
        if (!(canvas.width > 1) || typeof canvas.toBlob !== "function") return null;
        return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
    } finally {
        // WebKit counts a canvas's memory until its width is zero.
        canvas.width = 0;
        canvas.height = 0;
    }
}

// ── the mode, the card, the flight ──────────────────────────────────────────

/** A region of a printed page, as Page view's run finds it under a box on screen. */
export interface SnapshotRegion {
    page: number;
    /** The region as shares of the page as drawn at its turn. */
    frame: CropBox;
    rotation: number;
    /** CSS pixels per point the page is shown at. */
    onScreen: number;
    /** The region in the page's own units. */
    size: { width: number; height: number };
}

/** What was captured, and where it came from. */
export interface SnapshotCapture {
    blob: Blob;
    /** A figure dragged around on a page, or a picture the book holds. */
    kind: "figure" | "image";
    /** `p. 4`, `3 · The lazy controller`: how the card names the place. */
    label: string;
    /** The image's name, before its extension. */
    name: string;
    /** The `source::` citation, from #751's one producer. */
    citation: string;
    /** The source file, and the place a fleeting note keeps. */
    source: string;
    locator: ThoughtLocator;
}

/** What the Reader lends the snapshot. */
export interface SnapshotView {
    app: App;
    /** The Reader's root, positioned: the rectangle, the card and the flights are drawn in it. */
    root: HTMLElement;
    owner: Component;
    stage(): HTMLElement | null;
    /** The margin beside the page, when it is shown: where the card stands. */
    margin(): HTMLElement | null;
    /** The region of a printed page under a box on screen, or `null` off the pages. */
    regionAt(box: Box): SnapshotRegion | null;
    /** Capture a region at a scale, with where it came from; `null` when it cannot be drawn. */
    capture(region: SnapshotRegion, scale: number): Promise<SnapshotCapture | null>;
    /** The mode went on or off: the bar's button follows, and the ink palette steps aside. */
    modeChanged(on: boolean): void;
    /** Whether a thinking space is set, so a fleeting note can be kept. */
    canThink(): boolean;
    /** A fleeting note kept: shown under *Notes on this page*. Its row, for the landing. */
    pageNoteAdded(thought: Thought): HTMLElement | null;
    pageNoteRemoved(id: string): void;
}

/** Seams for tests: the writer, its undo, the note picker and opening a note. */
export interface SnapshotDeps {
    save?: (app: App, shot: SnapshotToSave, choice: SnapshotChoice) => Promise<SnapshotSaved | null>;
    undo?: (batch: string) => Promise<boolean>;
    pickNote?: (app: App, chosen: (path: string) => void) => void;
    open?: (app: App, path: string) => void;
}

interface Card {
    el: HTMLElement;
    img: HTMLImageElement;
    body: HTMLElement;
    shot: SnapshotCapture;
    url: string;
    seq: number;
    scope: Component;
    gone: boolean;
    busy: boolean;
    flight: Animation | null;
}

interface Drag {
    pointer: number;
    start: Point;
    rect: HTMLElement;
    box: Box;
}

function ownWindow(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

function isControl(target: EventTarget | null): boolean {
    const el = target as (Element & { closest?: (selector: string) => Element | null }) | null;
    return typeof el?.closest === "function" && el.closest("button, input, textarea, select, a") !== null;
}

function boxOf(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function noteTitle(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export class ReaderSnapshot implements ProposalOwner {
    private on = false;
    private drag: Drag | null = null;
    private card: Card | null = null;
    private hint: HTMLElement | null = null;
    private disposed = false;
    private readonly save: NonNullable<SnapshotDeps["save"]>;
    private readonly undo: NonNullable<SnapshotDeps["undo"]>;
    private readonly pickNote: NonNullable<SnapshotDeps["pickNote"]>;
    private readonly openNote: NonNullable<SnapshotDeps["open"]>;

    constructor(
        private readonly view: SnapshotView,
        deps: SnapshotDeps = {}
    ) {
        this.save = deps.save ?? saveSnapshot;
        this.undo = deps.undo ?? undoSnapshot;
        this.pickNote = deps.pickNote ?? ((app, chosen) => new InquiryNoteSuggest(app, chosen, t("reader_snapshot_pick")).open());
        // Opening a note is the view's (it routes every note it opens): nothing opens without one.
        this.openNote = deps.open ?? (() => undefined);
    }

    // ── the mode (FR-1, AC-6) ────────────────────────────────────────────────

    active(): boolean {
        return this.on;
    }

    toggle(): void {
        if (this.on) this.leave();
        else this.enter();
    }

    enter(): void {
        if (this.on || this.disposed) return;
        this.on = true;
        this.view.root.addClass(c("reader--snapshot"));
        this.view.modeChanged(true);
    }

    /** Leave the mode — Esc, the button again, the view gone — without capturing. */
    leave(): void {
        this.dropDrag();
        if (!this.on) return;
        this.on = false;
        this.view.root.removeClass(c("reader--snapshot"));
        this.view.modeChanged(false);
    }

    /** A pointer goes down on the page: in the mode, it is the drag's — never a selection, never a scroll. */
    claims(event: PointerEvent): boolean {
        if (!this.on || isControl(event.target) || (event.button !== undefined && event.button > 0)) return false;
        event.preventDefault?.();
        this.dropDrag();
        const start = { x: event.clientX, y: event.clientY };
        const rect = this.view.root.createDiv({ cls: c("reader-snapshot-rect"), attr: { "aria-hidden": "true" } });
        this.drag = { pointer: event.pointerId, start, rect, box: { left: start.x, top: start.y, width: 0, height: 0 } };
        this.placeRect(this.drag);
        try {
            this.view.stage()?.setPointerCapture?.(event.pointerId);
        } catch {
            // A pointer the platform no longer knows: the drag goes on without the capture.
        }
        return true;
    }

    /** The drag goes on: only the rectangle is drawn (FR-9). */
    move(event: PointerEvent): boolean {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointer) return false;
        event.preventDefault?.();
        drag.box = normalizeRect(drag.start, { x: event.clientX, y: event.clientY });
        this.placeRect(drag);
        return true;
    }

    /** The drag ends: too small says so, a region is captured and flies to its card (FR-4, FR-10). */
    release(event: PointerEvent): boolean {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointer) return false;
        event.preventDefault?.();
        drag.box = normalizeRect(drag.start, { x: event.clientX, y: event.clientY });
        this.drag = null;
        const region = tooSmall(drag.box) ? null : this.view.regionAt(drag.box);
        if (!region) {
            drag.rect.remove();
            this.say(t("reader_snapshot_too_small"));
            return true;
        }
        // One drag, one capture: the next drag reads again.
        this.leave();
        void this.view
            .capture(region, captureScale(region.onScreen, region.size))
            .then((shot) => {
                if (shot && !this.disposed) this.show(shot, drag.box, drag.rect);
                else {
                    drag.rect.remove();
                    if (!shot) this.say(t("reader_snapshot_failed"));
                }
            })
            .catch((error: unknown) => {
                drag.rect.remove();
                log.warn(`[Reader] a snapshot could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
                this.say(t("reader_snapshot_failed"));
            });
        return true;
    }

    /** The pointer was taken by the system: the rectangle goes, nothing captured. */
    cancel(event?: PointerEvent): void {
        if (this.drag && (!event || event.pointerId === this.drag.pointer)) this.dropDrag();
    }

    private dropDrag(): void {
        this.drag?.rect.remove();
        this.drag = null;
    }

    private placeRect(drag: Drag): void {
        const root = boxOf(this.view.root);
        drag.rect.setCssProps({
            "--zf-snap-x": `${Math.round(drag.box.left - root.left)}px`,
            "--zf-snap-y": `${Math.round(drag.box.top - root.top)}px`,
            "--zf-snap-w": `${Math.round(drag.box.width)}px`,
            "--zf-snap-h": `${Math.round(drag.box.height)}px`,
        });
    }

    /** One quiet line over the page, then gone (FR-4). */
    private say(text: string): void {
        this.hint?.remove();
        const hint = this.view.root.createDiv({ cls: c("reader-snapshot-hint"), text, attr: { role: "status" } });
        this.hint = hint;
        ownWindow(this.view.root).setTimeout(() => {
            if (this.hint !== hint) return;
            hint.remove();
            this.hint = null;
        }, HINT_MS);
    }

    // ── the card (FR-5) ──────────────────────────────────────────────────────

    hasCards(): boolean {
        return Boolean(this.card && !this.card.gone);
    }

    newestSeq(): number {
        return this.card && !this.card.gone ? this.card.seq : 0;
    }

    /** Esc on the card: it goes with nothing written — the same as *Cancel*. */
    dismissNewest(): void {
        this.cancelCard();
    }

    /** The card on screen, if any. */
    cardEl(): HTMLElement | null {
        return this.card && !this.card.gone ? this.card.el : null;
    }

    /**
     * The capture's card, in the margin, its picture flown there from `from` (FR-10). `rect` — the
     * dragged rectangle — goes the moment the picture lifts off.
     */
    show(shot: SnapshotCapture, from: Box, rect?: HTMLElement): void {
        this.closeCard();
        const root = this.view.root;
        const title = t(shot.kind === "figure" ? "reader_snapshot_figure" : "reader_snapshot_picture", shot.label);
        const el = root.createDiv({ cls: c("reader-snapshot-card"), attr: { role: "dialog", "aria-label": title } });
        const scope = new Component();
        scope.load();
        // A click on the card is not a new drag, a selection, or a click outside it.
        scope.registerDomEvent(el, "mousedown", (event: MouseEvent) => event.stopPropagation());
        const head = el.createDiv({ cls: c("reader-snapshot-head") });
        head.createDiv({ cls: c("reader-snapshot-title"), text: title });
        const url = URL.createObjectURL(shot.blob);
        const img = el.createEl("img", { cls: c("reader-snapshot-img"), attr: { src: url, alt: title } });
        // Its box is known before the picture has loaded: the flight lands on it.
        img.setCssProps({ "--zf-snap-ratio": `${Math.max(1, Math.round(from.width))} / ${Math.max(1, Math.round(from.height))}` });
        const body = el.createDiv({ cls: c("reader-snapshot-body") });
        const card: Card = { el, img, body, shot, url, seq: nextProposalSeq(), scope, gone: false, busy: false, flight: null };
        panelClose(head, { label: "reader_snapshot_cancel", onClose: () => this.cancelCard(), scope });
        scope.registerDomEvent(el, "keydown", (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            this.cancelCard();
        });
        this.card = card;
        this.place(el);
        this.drawChoices(card);
        rect?.remove();
        if (!motionWelcome(el)) return;
        // The picture lifts off the page and becomes the card's own: one picture, in flight (FR-10).
        img.addClass(c("reader-snapshot-img--waiting"));
        const ghost = root.createEl("img", { cls: c("reader-snapshot-ghost"), attr: { src: url, alt: "", "aria-hidden": "true" } });
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base, easing: MOTION.ease });
        card.flight = fly(root, ghost, from, boxOf(img), {
            duration: MOTION.cover,
            land: "become",
            lift: 1.02,
            onLanded: () => {
                card.flight = null;
                img.removeClass(c("reader-snapshot-img--waiting"));
            },
        });
        this.completeOnInput(card);
    }

    /** Any input during a flight completes it (FR-12): the key or the pointer lands it at once. */
    private completeOnInput(card: Card): void {
        const win = ownWindow(this.view.root);
        const finish = () => {
            card.flight?.finish();
            win.removeEventListener?.("keydown", finish, true);
            win.removeEventListener?.("pointerdown", finish, true);
        };
        win.addEventListener?.("keydown", finish, true);
        win.addEventListener?.("pointerdown", finish, true);
        card.scope.register(() => {
            win.removeEventListener?.("keydown", finish, true);
            win.removeEventListener?.("pointerdown", finish, true);
        });
    }

    /** In the margin when it is beside the page; at the page's right edge on a narrow pane. */
    private place(el: HTMLElement): void {
        const root = boxOf(this.view.root);
        const margin = this.view.margin();
        const at = margin ? boxOf(margin) : null;
        const inMargin = at && at.width > 0 && at.height > 0;
        el.toggleClass(c("reader-snapshot-card--margin"), Boolean(inMargin));
        el.setCssProps({
            "--zf-snap-card-x": inMargin && at ? `${Math.round(at.left - root.left)}px` : "auto",
            "--zf-snap-card-y": inMargin && at ? `${Math.round(Math.max(0, at.top - root.top))}px` : "auto",
        });
    }

    private button(parent: HTMLElement, card: Card, key: Parameters<typeof t>[0], primary: boolean, run: () => void): HTMLButtonElement {
        const button = parent.createEl("button", { cls: primary ? "mod-cta" : "", text: t(key), attr: { type: "button" } });
        card.scope.registerDomEvent(button, "click", () => {
            if (!card.busy) run();
        });
        return button;
    }

    /** Where it goes: *Add note · Fleeting note · Attach to a note*, and *Cancel*. */
    private drawChoices(card: Card): void {
        card.body.empty();
        const actions = card.body.createDiv({ cls: c("reader-snapshot-actions") });
        this.button(actions, card, "reader_snapshot_add_note", true, () => this.preview(card));
        this.button(actions, card, "reader_snapshot_fleeting", false, () => void this.choose(card, { kind: "fleeting", locator: card.shot.locator }));
        this.button(actions, card, "reader_snapshot_attach", false, () => this.attach(card));
        this.button(actions, card, "reader_snapshot_cancel", false, () => this.cancelCard());
    }

    /** *Add note* (FR-5.1, FR-11): the note's preview grows out of the card — the image, a caption, `source::`. */
    private preview(card: Card): void {
        card.body.empty();
        const preview = card.body.createDiv({ cls: c("reader-snapshot-preview") });
        const caption = preview.createEl("textarea", { cls: c("reader-snapshot-caption"), attr: { rows: "2", placeholder: t("reader_snapshot_caption"), "aria-label": t("reader_snapshot_caption") } });
        preview.createDiv({ cls: c("reader-snapshot-source"), text: `source:: ${card.shot.citation}` });
        const actions = preview.createDiv({ cls: c("reader-snapshot-actions") });
        this.button(actions, card, "reader_snapshot_create", true, () => void this.choose(card, { kind: "note", caption: caption.value, title: card.shot.name }));
        this.button(actions, card, "reader_snapshot_cancel", false, () => this.drawChoices(card));
        if (motionWelcome(preview)) {
            preview.animate(
                [
                    { transform: "scale(0.96)", opacity: 0 },
                    { transform: "scale(1)", opacity: 1 },
                ],
                { duration: MOTION.base, easing: MOTION.ease }
            );
        }
        caption.focus?.();
    }

    /** *Attach to a note* (FR-5.3): Obsidian's own picker; nothing is written until a note is chosen. */
    private attach(card: Card): void {
        this.pickNote(this.view.app, (path) => {
            if (card.gone || this.card !== card) return;
            void this.choose(card, { kind: "attach", path });
        });
    }

    /** A choice is made: the one writer runs, in one batch, and the picture goes where it went (FR-6, FR-11). */
    private async choose(card: Card, choice: SnapshotChoice): Promise<void> {
        if (card.busy || card.gone) return;
        if (choice.kind === "fleeting" && !this.view.canThink()) {
            this.status(card, t("reader_hl_no_lab"));
            return;
        }
        card.busy = true;
        card.flight?.finish();
        const saved = await this.save(this.view.app, { blob: card.shot.blob, name: card.shot.name, citation: card.shot.citation, source: card.shot.source }, choice);
        card.busy = false;
        if (card.gone) return;
        if (!saved) {
            this.status(card, t("reader_snapshot_failed"));
            return;
        }
        const undo = saved.batch ? this.undoer(card, saved) : undefined;
        if (choice.kind === "note" && saved.path) {
            const path = saved.path;
            this.status(card, t("reader_snapshot_created", noteTitle(path)), { open: () => this.openNote(this.view.app, path), undo });
        } else if (choice.kind === "fleeting") {
            const row = saved.thought ? this.view.pageNoteAdded(saved.thought) : null;
            this.landIn(card, row);
            // The row it landed in is in the margin: the line steps down, clear of it (walk).
            if (row) card.el.addClass(c("reader-snapshot-card--low"));
            this.status(card, t("reader_snapshot_kept"), { undo });
            if (row && motionWelcome(card.el)) card.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base, easing: MOTION.ease });
        } else if (choice.kind === "attach") {
            const path = choice.path;
            this.sendOff(card);
            this.status(card, t("reader_snapshot_attached", noteTitle(path)), { open: () => this.openNote(this.view.app, path), undo });
        }
    }

    private undoer(card: Card, saved: SnapshotSaved): () => void {
        return () => {
            const batch = saved.batch;
            if (!batch) return;
            void this.undo(batch).then((ok) => {
                if (ok && saved.thought) this.view.pageNoteRemoved(saved.thought.id);
                if (!card.gone) this.status(card, t(ok ? "reader_snapshot_undone" : "reader_snapshot_failed"));
            });
        };
    }

    /** A fleeting note: the picture flies into its row under *Notes on this page* (FR-11). */
    private landIn(card: Card, row: HTMLElement | null): void {
        const target = row?.querySelector("img") ?? row;
        if (!target || !motionWelcome(card.el)) return;
        const to = boxOf(target);
        if (!(to.width > 0 && to.height > 0)) return;
        const ghost = this.view.root.createEl("img", { cls: c("reader-snapshot-ghost"), attr: { src: card.url, alt: "", "aria-hidden": "true" } });
        fly(this.view.root, ghost, boxOf(card.img), to, { duration: MOTION.cover, land: "become" });
    }

    /** *Attach*: the picture goes off towards the margin's edge, where the note is (FR-11). */
    private sendOff(card: Card): void {
        if (!motionWelcome(card.img)) return;
        const root = boxOf(this.view.root);
        const img = boxOf(card.img);
        const dx = Math.max(0, Math.round(root.left + root.width - img.left));
        const ghost = this.view.root.createEl("img", { cls: c("reader-snapshot-ghost"), attr: { src: card.url, alt: "", "aria-hidden": "true" } });
        fly(this.view.root, ghost, img, { left: img.left + dx, top: img.top, width: img.width * 0.5, height: img.height * 0.5 }, { duration: MOTION.base });
    }

    /** The card becomes one line — what happened, and its ways back — then goes. */
    private status(card: Card, text: string, actions: { open?: () => void; undo?: () => void } = {}): void {
        card.el.addClass(c("reader-snapshot-card--status"));
        card.body.empty();
        const line = card.body.createDiv({ cls: c("reader-snapshot-status"), attr: { role: "status" } });
        line.createSpan({ text });
        if (actions.open) this.button(line, card, "reader_export_open", false, actions.open).addClass(c("reader-snapshot-link"));
        if (actions.undo) {
            const undo = actions.undo;
            const button = this.button(line, card, "changes_undo", false, () => {
                button.disabled = true;
                undo();
            });
            button.addClass(c("reader-snapshot-link"));
        }
        const win = ownWindow(this.view.root);
        const timer = win.setTimeout(() => {
            if (this.card === card) this.closeCard();
        }, STATUS_MS);
        card.scope.register(() => win.clearTimeout(timer));
    }

    /** *Cancel* (FR-11, AC-3): the card sinks back and fades, and nothing is written. */
    cancelCard(): void {
        const card = this.card;
        if (!card || card.gone) return;
        if (card.busy) return;
        card.flight?.finish();
        this.letGo(card);
        if (!motionWelcome(card.el)) {
            card.el.remove();
            return;
        }
        card.el.addClass(c("reader-snapshot-card--leaving"));
        const out = card.el.animate(
            [
                { transform: "translateY(0px)", opacity: 1 },
                { transform: `translateY(${SINK_PX}px)`, opacity: 0 },
            ],
            { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }
        );
        const drop = () => card.el.remove();
        out.onfinish = drop;
        ownWindow(card.el).setTimeout(drop, MOTION.base + 300);
    }

    /** The card goes at once: a status line ran its time, the view is closing, another capture came. */
    private closeCard(): void {
        const card = this.card;
        if (!card || card.gone) return;
        card.flight?.finish();
        this.letGo(card);
        card.el.remove();
    }

    private letGo(card: Card): void {
        card.gone = true;
        if (this.card === card) this.card = null;
        card.scope.unload();
        // The picture is let go with its card: nothing of a capture outlives it but what you kept.
        const win = ownWindow(this.view.root);
        win.setTimeout(() => URL.revokeObjectURL(card.url), MOTION.cover + 300);
    }

    dispose(): void {
        this.disposed = true;
        this.leave();
        this.closeCard();
        this.hint?.remove();
        this.hint = null;
    }
}

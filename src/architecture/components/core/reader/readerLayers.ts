import { c } from "architecture";
import { DEFAULT_LAYER, MARK_LAYERS, isLayer, layerOf, type MarkLayer } from "application/thinking/markLayer";
import { meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";
import type { Thought } from "application/thinking/thought";
import { LIBRARY_LIMIT } from "application/library/sourceMeta";
import { MOTION, motionWelcome } from "./readerMotion";
import { fadeOwn, isAway, liftInk, putAway, type InkMove } from "./readerInkLift";

/**
 * **Layers, and read it clean** (#758, epic #742) — what the page shows of your marks, and the one
 * mechanism that hides them and brings them back.
 *
 * Every mark is on a layer — reading, reflection, research (`markLayer.ts`). Which layers are shown
 * is remembered per source; *Hide my annotations* puts every mark away for the sitting, and *Reveal
 * my thinking* brings them back **in the order you made them**. None of it writes: it changes what is
 * drawn, never what is kept (FR-10).
 *
 * FR-11: hiding and revealing in order are this file and `readerInkLift.ts`, and nothing else in the
 * Reader puts a mark away. Recall (#760) uses `MarkVisibility` as it is.
 */

/** What decides whether a mark is drawn. */
export interface LayerState {
    hidden: readonly MarkLayer[];
    /** Read it clean (FR-8): every mark is away but the ones made since `cleanSince`. */
    clean: boolean;
    cleanSince: number;
    /** The margin's meaning chip (#720), when one is chosen: both narrow (FR-7). */
    meaning?: HighlightMeaning | null;
}

/** The rule (FR-7, FR-8): a mark is drawn when its layer is shown, its meaning chosen, and you are not reading clean — or made it while you were. */
export function markShown(thought: Pick<Thought, "layer" | "at" | "meaning">, state: LayerState): boolean {
    if (state.meaning && meaningOf(thought) !== state.meaning) return false;
    if (state.hidden.includes(layerOf(thought))) return false;
    if (state.clean && !(thought.at >= state.cleanSince)) return false;
    return true;
}

/** One mark after another (FR-13): this far apart… */
export const REVEAL_STEP_MS = 350;
/** …or closer, so a whole chapter is back within this. */
export const REVEAL_WITHIN_MS = 4000;

/** How far apart `n` returning marks are. */
export function revealStep(n: number): number {
    return n > 0 ? Math.min(REVEAL_STEP_MS, REVEAL_WITHIN_MS / n) : 0;
}

/** The order of a reveal (AC-5): the marks in the order you made them, each with its delay. */
export function revealSchedule<T extends Pick<Thought, "at">>(marks: readonly T[]): { mark: T; delay: number }[] {
    const step = revealStep(marks.length);
    return marks
        .map((mark, i) => ({ mark, i }))
        .sort((a, b) => a.mark.at - b.mark.at || a.i - b.i)
        .map(({ mark }, i) => ({ mark, delay: Math.round(i * step) }));
}

// ── what is remembered, per source (FR-4, FR-5) ────────────────────────────────

/** A source's layers: where new marks go and which are hidden. Absent is reading, and all shown. */
export interface LayerPrefs {
    target?: MarkLayer;
    hidden?: MarkLayer[];
}

/** By reading: a book's, a paper's or an article's path, or the note a reading began from. */
export type LayerPrefsMap = Record<string, LayerPrefs>;

/** Read a stored map, keeping only what makes sense. Never throws. */
export function normalizeLayerPrefs(raw: unknown): LayerPrefsMap {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: LayerPrefsMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!key || value === null || typeof value !== "object") continue;
        const v = value as Record<string, unknown>;
        const target = isLayer(v.target) && v.target !== DEFAULT_LAYER ? v.target : undefined;
        const hidden = Array.isArray(v.hidden) ? MARK_LAYERS.filter((layer) => (v.hidden as unknown[]).includes(layer)) : [];
        const entry: LayerPrefs = { ...(target ? { target } : {}), ...(hidden.length ? { hidden } : {}) };
        if (entry.target || entry.hidden) out[key] = entry;
    }
    return out;
}

/** A source's layers as they apply: reading and nothing hidden, until you chose otherwise. */
export function layerPrefsOf(map: LayerPrefsMap, key: string | null): { target: MarkLayer; hidden: MarkLayer[] } {
    const entry = key ? map[key] : undefined;
    return { target: entry?.target ?? DEFAULT_LAYER, hidden: [...(entry?.hidden ?? [])] };
}

/**
 * The map with `key`'s layers changed: the defaults are not kept, the one changed last goes to the
 * end, and the oldest go once there are more than the Library keeps.
 */
export function withLayerPrefs(map: LayerPrefsMap, key: string, next: { target: MarkLayer; hidden: readonly MarkLayer[] }): LayerPrefsMap {
    const out: LayerPrefsMap = { ...map };
    delete out[key];
    const hidden = MARK_LAYERS.filter((layer) => next.hidden.includes(layer));
    const entry: LayerPrefs = { ...(next.target !== DEFAULT_LAYER ? { target: next.target } : {}), ...(hidden.length ? { hidden } : {}) };
    if (entry.target || entry.hidden) out[key] = entry;
    const keys = Object.keys(out);
    for (const old of keys.slice(0, Math.max(0, keys.length - LIBRARY_LIMIT))) delete out[old];
    return out;
}

// ── the one mechanism (FR-11) ───────────────────────────────────────────────────

/** What the visibility needs of the Reader: where marks are drawn, and what they are. */
export interface MarkPort {
    /** The reader's root: every mark, row and ink note of the reading is under it. */
    root(): HTMLElement | null;
    /** The scroller the page is in: where a lifted ink is drawn, under the words. */
    stage(): HTMLElement | null;
    /** Every mark of what is on screen — highlights, page notes, ink. */
    thoughts(): readonly Thought[];
    /** The equations and drawings a highlight tints whole (#770): its ink too. */
    tintsOf(id: string): HTMLElement[];
    /** Whether a mark's element is on screen now: those return in order, the others are simply there. */
    onScreen(el: HTMLElement): boolean;
    /** Whether words are being selected: a reveal never runs then (FR-14). */
    selecting(): boolean;
}

type Kind = "text" | "own" | "row";

/** A mark's elements, by how each moves. */
interface Drawn {
    thought: Thought;
    els: { el: HTMLElement; kind: Kind }[];
}

const MARK_ATTRS = ["data-hl", "data-ink", "data-note"] as const;

function kindOf(el: HTMLElement): Kind | null {
    if (el.hasClass(c("reader-highlight"))) return "text";
    if (el.hasClass(c("reader-hl-item"))) return "row";
    if (el.hasClass(c("reader-ink-note")) || el.hasClass(c("reader-ink-pagemark"))) return "own";
    return null;
}

/**
 * **What is drawn of your marks** — the layers hidden, reading clean, and the reveal in order. It
 * holds no marks: every time it is asked, it reads what the Reader has drawn, so a chapter turned, a
 * mark made or a margin redrawn is put right by `apply()`.
 */
export class MarkVisibility {
    private hidden = new Set<MarkLayer>();
    private clean = false;
    private cleanSince = 0;
    private moves: InkMove[] = [];
    private revealing = false;
    private stopListening: (() => void) | null = null;

    constructor(
        private readonly port: MarkPort,
        private readonly now: () => number = () => Date.now()
    ) {}

    /** A reading opened: its hidden layers, and every mark shown — reading clean lasts a sitting (FR-8). */
    load(hidden: readonly MarkLayer[]): void {
        this.finish();
        this.hidden = new Set(hidden.filter(isLayer));
        this.clean = false;
        this.apply();
    }

    hiddenLayers(): MarkLayer[] {
        return MARK_LAYERS.filter((layer) => this.hidden.has(layer));
    }

    isClean(): boolean {
        return this.clean;
    }

    isRevealing(): boolean {
        return this.revealing;
    }

    state(meaning: HighlightMeaning | null = null): LayerState {
        return { hidden: this.hiddenLayers(), clean: this.clean, cleanSince: this.cleanSince, meaning };
    }

    shows(thought: Pick<Thought, "layer" | "at" | "meaning">): boolean {
        return markShown(thought, this.state());
    }

    /** The layers that have a mark on screen: a layer with none is dimmed in the panel (FR-3). */
    present(): Set<MarkLayer> {
        return new Set(this.port.thoughts().map((thought) => layerOf(thought)));
    }

    /** Put every mark drawn now as the rule says, at once. Called after anything is drawn. */
    apply(): void {
        this.finish();
        for (const drawn of this.drawn()) {
            const away = !this.shows(drawn.thought);
            for (const { el } of drawn.els) putAway(el, away);
        }
    }

    /** One layer off (FR-16): its ink fades out, `fast`. */
    hideLayer(layer: MarkLayer): void {
        this.change(() => this.hidden.add(layer), MOTION.fast, false);
    }

    /** One layer on again: its ink fades in, `fast`. */
    showLayer(layer: MarkLayer): void {
        this.change(() => this.hidden.delete(layer), MOTION.fast, false);
    }

    /** *Hide my annotations* (FR-8, FR-15): every mark away in one quiet fade, all at once. */
    hideAll(): void {
        this.change(() => {
            this.clean = true;
            this.cleanSince = this.now();
        }, MOTION.fast, false);
    }

    /**
     * *Reveal my thinking* (FR-9, FR-13): the marks come back. Those on screen return one by one in
     * the order you made them, each ink sweeping in under still words; the others are simply there.
     * Never while you select: then they are all there at once (FR-14).
     */
    reveal(): void {
        this.change(() => (this.clean = false), MOTION.base, !this.port.selecting());
    }

    /** Any input during a reveal (FR-14), a scroll, a redraw: everything where it ends, at once. */
    finish(): void {
        const moves = this.moves;
        this.moves = [];
        for (const move of moves) {
            for (const animation of move.animations) animation.finish?.();
            move.end();
        }
        this.endReveal();
    }

    // ── how ───────────────────────────────────────────────────────────────────

    /** Every mark drawn under the root, with its elements — one pass over the page. */
    private drawn(): Drawn[] {
        const root = this.port.root();
        if (!root) return [];
        const byId = new Map<string, Drawn>();
        for (const thought of this.port.thoughts()) byId.set(thought.id, { thought, els: [] });
        if (byId.size === 0) return [];
        const selector = MARK_ATTRS.map((attr) => `[${attr}]`).join(", ");
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
            const kind = kindOf(el);
            if (!kind) continue;
            const id = MARK_ATTRS.map((attr) => el.getAttribute(attr)).find((value) => value !== null);
            const entry = id ? byId.get(id) : undefined;
            if (entry) entry.els.push({ el, kind });
        }
        for (const entry of byId.values()) {
            for (const tint of this.port.tintsOf(entry.thought.id)) if (!entry.els.some((e) => e.el === tint)) entry.els.push({ el: tint, kind: "text" });
        }
        return [...byId.values()].filter((entry) => entry.els.length > 0);
    }

    /**
     * Change the state, then move what it changed: out together, or in — `inOrder`, one after another
     * as you made them. Under reduced motion every mark simply arrives or leaves (FR-17).
     */
    private change(update: () => void, duration: number, inOrder: boolean): void {
        this.finish();
        const before = this.drawn().map((drawn) => ({ drawn, was: this.shows(drawn.thought) }));
        update();
        const going: Drawn[] = [];
        const coming: Drawn[] = [];
        for (const { drawn, was } of before) {
            const now = this.shows(drawn.thought);
            if (was && !now) going.push(drawn);
            else if (!was && now) coming.push(drawn);
            else for (const { el } of drawn.els) putAway(el, !now);
        }
        const root = this.port.root();
        const stage = this.port.stage();
        if (!root || !stage || !motionWelcome(root)) {
            for (const drawn of going) drawn.els.forEach(({ el }) => putAway(el, true));
            for (const drawn of coming) drawn.els.forEach(({ el }) => putAway(el, false));
            return;
        }
        for (const drawn of going) this.move(drawn, "out", 0, duration, stage);
        if (!inOrder) {
            for (const drawn of coming) this.move(drawn, "in", 0, duration, stage);
            return;
        }
        // On screen, in the order you made them; the rest are simply there.
        const seen = coming.filter((drawn) => drawn.els.some(({ el, kind }) => kind !== "row" && this.port.onScreen(el)));
        for (const drawn of coming) if (!seen.includes(drawn)) drawn.els.forEach(({ el }) => putAway(el, false));
        const schedule = revealSchedule(seen.map((drawn) => ({ at: drawn.thought.at, drawn })));
        for (const { mark, delay } of schedule) this.move(mark.drawn, "in", delay, duration, stage);
        if (this.moves.length > 0) this.startReveal(root);
    }

    /** One mark's elements moving: the text's ink lifted under the words, everything else by its own opacity. */
    private move(drawn: Drawn, way: "in" | "out", delay: number, duration: number, stage: HTMLElement): void {
        const timing = { delay, duration };
        const text = drawn.els.filter(({ kind }) => kind === "text").map(({ el }) => el);
        // A mark already where it is going does not move.
        const moving = text.filter((el) => isAway(el) === (way === "in"));
        if (moving.length > 0) {
            const lift = liftInk(moving, stage, way, timing);
            if (lift) this.moves.push(lift);
            else moving.forEach((el) => putAway(el, way === "out"));
        }
        for (const { el, kind } of drawn.els) {
            if (kind === "text") continue;
            if (isAway(el) !== (way === "in")) continue;
            const fade = fadeOwn(el, way, timing, kind === "row" && way === "in");
            if (fade) this.moves.push(fade);
        }
    }

    /** While marks return, any key, press or wheel completes it (FR-14). */
    private startReveal(root: HTMLElement): void {
        this.revealing = true;
        const win = (root as HTMLElement & { win?: Window }).win;
        if (!win?.addEventListener) return;
        const done = () => this.finish();
        const events = ["keydown", "pointerdown", "wheel", "resize"] as const;
        for (const name of events) win.addEventListener(name, done, { capture: true, passive: true });
        this.stopListening = () => {
            for (const name of events) win.removeEventListener(name, done, { capture: true });
        };
        // The reveal ends by itself once the last mark is back.
        const timeout = win.setTimeout?.(() => {
            if (this.revealing) this.finish();
        }, REVEAL_WITHIN_MS + MOTION.base + 200);
        const stop = this.stopListening;
        this.stopListening = () => {
            stop();
            if (timeout !== undefined) win.clearTimeout?.(timeout);
        };
    }

    private endReveal(): void {
        this.revealing = false;
        this.stopListening?.();
        this.stopListening = null;
    }
}

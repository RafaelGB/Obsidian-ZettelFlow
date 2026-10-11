import type { Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { Thought } from "application/thinking/thought";
import { MOTION, motionWelcome } from "./readerMotion";
import { renderInkThumb } from "./readerInkThumb";

/**
 * **What survived?** — the leaf (#755, epic #742): a page of the book between two chapters, never a
 * modal. What you marked in the chapter, your ink, the notes of yours it touched, and one question:
 * *is one of these worth a note of its own?* You answer by writing, or you turn the leaf.
 *
 * It never writes for you: no summary, no key points, no count, no score, no AI text (FR-5). Every
 * string on it is a locale string or comes from your own marks and notes. The leaf itself writes
 * nothing; *Write a note* opens the crystallize preview, where only *Create note* does.
 */

/** How many rows rise in turn (FR-12); the rest are simply there. */
export const SURVIVED_STAGGERED = 8;
/** The step between two rising parts of the leaf (FR-12). */
export const SURVIVED_STEP_MS = 40;

type Box = { left: number; top: number; width: number; height: number };

export interface SurvivedNote {
    path: string;
    title: string;
}

export interface SurvivedCard {
    /** *End of chapter 4*, or *End of* a PDF section's name. */
    kicker: string;
    /** The chapter's title, when it has one of its own. */
    title?: string;
    /** Your highlights and margin notes in the chapter, in reading order. */
    marks: readonly Thought[];
    /** Your ink notes in the chapter (#745), drawn as ink. */
    ink: readonly Thought[];
    /** The notes of yours the chapter touched. */
    touched: readonly SurvivedNote[];
    /** An ink note's drawing, read when the leaf is drawn. */
    drawingOf?: (thought: Thought) => Promise<string | undefined>;
    /** Whether the leaf may move: no animation at all under reduced motion (FR-15). */
    motion: boolean;
    /** How long until the chapter turn lands (ms): the contents settle once it has (FR-12). */
    settleAfter?: number;
    actions: {
        /** *Write a note*: the crystallize preview for this mark, grown from its row (FR-4, FR-13). */
        write(thought: Thought, origin: Box): void;
        /** *Keep reading*: the leaf's one primary action (FR-4). */
        keepReading(): void;
        /** *Don't pause at chapter ends* (FR-8). */
        dontPause(): void;
        /** A note it touched, opened where you are. */
        open(anchor: HTMLElement, path: string, title: string): void;
        /** Anything on the leaf was touched: leaving it is no longer a skip (FR-7). */
        touched(): void;
    };
}

export interface SurvivedLeaf {
    root: HTMLElement;
    /** The settle completed at once: any input does this (FR-12). */
    finish(): void;
}

function snippet(text: string, max = 180): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function boxOf(el: HTMLElement): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Draw the leaf into the page — the same element a chapter is drawn in, the way the end card is. */
export function renderSurvivedLeaf(page: HTMLElement, card: SurvivedCard, owner: Component): SurvivedLeaf {
    page.empty();
    const root = page.createDiv({ cls: c("reader-survived") });
    const settling: HTMLElement[] = [];

    const ornament = root.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } });
    ornament.createSpan({ cls: c("reader-ornament-mark") });
    settling.push(ornament);

    const head = root.createDiv({ cls: c("reader-survived-head") });
    head.createDiv({ cls: c("reader-count"), text: card.kicker });
    head.createEl("h1", { cls: c("reader-chapter-title"), text: t("reader_survived_title") });
    if (card.title) head.createDiv({ cls: c("reader-survived-chapter"), text: card.title });
    settling.push(head);

    const rows: HTMLElement[] = [];
    let chosen: HTMLElement | null = null;

    if (card.marks.length > 0) {
        const section = root.createDiv({ cls: c("reader-survived-section") });
        section.createDiv({ cls: c("reader-hl-heading"), text: t("reader_survived_marks") });
        for (const thought of card.marks) {
            const meaning = thought.meaning ?? "idea";
            const row = section.createDiv({ cls: [c("reader-hl-item"), c(`reader-hl-item--${meaning}`), c("reader-survived-mark")], attr: { "data-hl": thought.id } });
            // The meaning's ink, drawn beside the row when it is chosen (FR-13).
            row.createSpan({ cls: c("reader-survived-ink-bar"), attr: { "aria-hidden": "true" } });
            const pick = row.createEl("button", { cls: c("reader-survived-pick"), attr: { type: "button", "aria-pressed": "false" } });
            if (thought.quote?.exact) pick.createDiv({ cls: c("reader-hl-quote"), text: snippet(thought.quote.exact) });
            if (thought.text.trim()) pick.createDiv({ cls: c("reader-hl-note"), text: thought.text.trim() });
            owner.registerDomEvent(pick, "click", () => {
                card.actions.touched();
                chosen = choose(row, chosen, thought, card, owner);
            });
            rows.push(row);
        }
    }

    if (card.ink.length > 0) {
        const section = root.createDiv({ cls: c("reader-survived-section") });
        section.createDiv({ cls: c("reader-hl-heading"), text: t("reader_survived_ink") });
        for (const thought of card.ink) {
            const row = section.createDiv({ cls: [c("reader-hl-item"), c("reader-ink-item"), c("reader-survived-ink")], attr: { "data-ink": thought.id } });
            const thumb = row.createDiv({ cls: c("reader-ink-item-thumb") });
            void card.drawingOf?.(thought).then(
                (svg) => {
                    if (svg) renderInkThumb(thumb, svg);
                },
                () => undefined
            );
            rows.push(row);
        }
    }

    if (card.touched.length > 0) {
        const section = root.createDiv({ cls: c("reader-survived-section") });
        section.createDiv({ cls: c("reader-hl-heading"), text: t("reader_survived_touched") });
        const list = section.createDiv({ cls: c("reader-survived-touched") });
        for (const note of card.touched) {
            const link = list.createEl("button", { cls: c("reader-survived-note"), attr: { type: "button", "data-path": note.path }, text: note.title });
            owner.registerDomEvent(link, "click", () => {
                card.actions.touched();
                // The peek opens under the list, as under a paragraph: the names stay where they are.
                card.actions.open(list, note.path, note.title);
            });
            rows.push(link);
        }
    }

    const question = root.createDiv({ cls: c("reader-survived-question"), text: t("reader_survived_question") });

    const foot = root.createDiv({ cls: c("reader-survived-foot") });
    const keep = foot.createEl("button", { cls: ["mod-cta", c("reader-survived-keep")], attr: { type: "button" } });
    keep.createSpan({ text: t("reader_survived_keep_reading") });
    keep.createSpan({ cls: c("reader-survived-arrow"), text: "→", attr: { "aria-hidden": "true" } });
    owner.registerDomEvent(keep, "click", () => card.actions.keepReading());
    const quiet = foot.createEl("button", { cls: c("reader-survived-quiet"), attr: { type: "button" }, text: t("reader_survived_dont_pause") });
    owner.registerDomEvent(quiet, "click", () => {
        card.actions.touched();
        card.actions.dontPause();
    });
    foot.createDiv({ cls: c("reader-survived-no-summary"), text: t("reader_survived_no_summary") });

    const animations = card.motion ? settle([...settling, ...rows.slice(0, SURVIVED_STAGGERED)], [question, foot], Math.max(0, card.settleAfter ?? 0)) : [];
    const finish = () => {
        for (const animation of animations.splice(0)) {
            try {
                animation.finish();
            } catch {
                // Already gone.
            }
        }
    };
    if (animations.length > 0) {
        // Input at any moment completes the settle (FR-12): a pointer on the leaf, a key anywhere.
        owner.registerDomEvent(root, "pointerdown", finish);
        const win = (root as HTMLElement & { win?: Window }).win;
        if (win && typeof win.addEventListener === "function") owner.registerDomEvent(win, "keydown", finish, { capture: true });
    }
    return { root, finish };
}

/**
 * The contents settle in the reading column (FR-12), once the turn has landed (`after`): the ornament,
 * the heading, the rows one after another — each a fade and a 4 px rise, 40 ms apart, on the shared
 * curve — and the question last.
 */
function settle(order: readonly HTMLElement[], last: readonly HTMLElement[], after: number): Animation[] {
    const out: Animation[] = [];
    const rise = (el: HTMLElement, delay: number) => {
        if (!motionWelcome(el)) return;
        const animation = el.animate(
            [
                { opacity: 0, transform: "translateY(4px)" },
                { opacity: 1, transform: "translateY(0px)" },
            ],
            { duration: MOTION.base, easing: MOTION.ease, delay, fill: "backwards" }
        );
        if (animation) out.push(animation);
    };
    order.forEach((el, i) => rise(el, after + i * SURVIVED_STEP_MS));
    last.forEach((el) => rise(el, after + order.length * SURVIVED_STEP_MS));
    return out;
}

/** Choose a mark (FR-13): it lifts a little, its ink is drawn beside it, and *Write a note* is offered. */
function choose(row: HTMLElement, before: HTMLElement | null, thought: Thought, card: SurvivedCard, owner: Component): HTMLElement | null {
    if (before && before !== row) unchoose(before);
    if (before === row) {
        unchoose(row);
        return null;
    }
    row.addClass("is-active");
    row.querySelector(`.${c("reader-survived-pick")}`)?.setAttribute("aria-pressed", "true");
    const write = row.createEl("button", { cls: c("reader-survived-write"), attr: { type: "button" }, text: t("reader_survived_write") });
    owner.registerDomEvent(write, "click", () => {
        card.actions.touched();
        card.actions.write(thought, boxOf(row));
    });
    if (card.motion && motionWelcome(row)) {
        row.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }], { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" });
        const bar = row.querySelector<HTMLElement>(`.${c("reader-survived-ink-bar")}`);
        bar?.animate(
            [
                { opacity: 0, transform: "scaleY(0)" },
                { opacity: 1, transform: "scaleY(1)" },
            ],
            { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" }
        );
    }
    return row;
}

function unchoose(row: HTMLElement): void {
    row.removeClass("is-active");
    row.querySelector(`.${c("reader-survived-pick")}`)?.setAttribute("aria-pressed", "false");
    row.querySelector(`.${c("reader-survived-write")}`)?.remove();
    for (const animation of row.getAnimations?.() ?? []) animation.cancel();
    const bar = row.querySelector<HTMLElement>(`.${c("reader-survived-ink-bar")}`);
    for (const animation of bar?.getAnimations?.() ?? []) animation.cancel();
}

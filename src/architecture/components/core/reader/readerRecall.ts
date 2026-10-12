import type { Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { Thought } from "application/thinking/thought";
import { recallWords, renderRecallNote } from "application/library/recallNote";
import { MOTION, motionWelcome } from "./readerMotion";
import { panelHead, type PanelClose } from "./readerPanelHead";
import type { FoldWay } from "./readerTurn";

/**
 * **Recall** (#760, epic #742): write the chapter from memory, then look.
 *
 * Recall puts the chapter and your marks away, asks for the chapter in your own words, then shows you
 * what you marked — yours first, then the book's, as Think does with *think first, then look* (#470).
 * It is not a test: nothing is compared, matched, counted or scored (FR-5), and what you type is kept
 * exactly as you type it — never corrected, completed or suggested to (FR-3, §XII).
 *
 * This is the margin's card: the question, the box, the reveal, the preview of the note. It writes
 * nothing; *Create note* hands your words to the view, whose one named writer (`readerRecallNote.ts`)
 * makes the note. It never hides a mark itself either: hiding and revealing are #758's
 * `MarkVisibility`, through the view (AC-2).
 */

/** The chapter recalled, as the card names it and as the note cites it. */
export interface RecallChapter {
    /** `source#chapter`: where the draft is kept for the sitting (FR-7). */
    key: string;
    /** The chapter's name, under the panel's head and on the paper the fold leaves. */
    name: string;
    /** The note's title as proposed: *{chapter} — in my words*. */
    proposal: string;
    /** The `source::` line's citation (#751). */
    citation: string;
}

/** A note kept: its title as written, the way to it, and the way back. */
export interface RecallKept {
    title: string;
    /** The crystallize flow the words went on into: it builds the note, and offers its own way back. */
    flow?: string;
    open?: () => void;
    undo?: () => Promise<boolean>;
}

/** What the card needs of the Reader. */
export interface RecallPort {
    /** The page goes, or comes back: one gesture each (FR-10, FR-11). */
    fold(way: FoldWay): Promise<void>;
    /** #758's *hide*: every mark away (FR-2). */
    hideMarks(): void;
    /** #758's *reveal*, in the order you made them (FR-4). */
    revealMarks(): void;
    /** Anything new that draws marks says so: the card's rows are put as the layers say. */
    marksDrawn(): void;
    /** Your marks in the chapter, read when they are shown. */
    marks(): readonly Thought[];
    /** What you typed, kept for the sitting (FR-7). */
    draft(words: string): void;
    /** The crystallize flow a new note continues in, by name; `""` when none (FR-6). */
    flowName(): string;
    /** *Create note* (FR-6): the only write. `null` when it could not be kept. */
    keep(title: string, words: string): Promise<RecallKept | null>;
    /** *Done* (FR-7): the view closes the card. */
    done(): void;
    /** Whether the card may move. */
    motion(): boolean;
}

type Phase = "writing" | "folding" | "revealing" | "revealed";

function snippet(text: string, max = 180): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The card's words that ask: transform and opacity, the shared curve. */
function rise(el: HTMLElement, duration: number, delay = 0): Animation | null {
    if (!motionWelcome(el)) return null;
    return (
        el.animate(
            [
                { opacity: 0, transform: "translateY(8px)" },
                { opacity: 1, transform: "translateY(0px)" },
            ],
            { duration, easing: MOTION.ease, delay, fill: "backwards" }
        ) ?? null
    );
}

/**
 * One recall of one chapter, for as long as its card is open. It keeps its own state, so the card is
 * drawn again in place (a resize, a sheet) exactly as it was — never moving again once it settled.
 */
export class RecallSession {
    private phase: Phase = "writing";
    private words: string;
    private title: string;
    private preview = false;
    private busy = false;
    private kept: RecallKept | null = null;
    private status: string | null = null;
    private settled = false;
    private host: HTMLElement | null = null;
    private scope: Component | null = null;
    private close: PanelClose | undefined;
    private box: HTMLTextAreaElement | null = null;
    private moving: Animation[] = [];

    constructor(
        readonly chapter: RecallChapter,
        private readonly port: RecallPort,
        draft = ""
    ) {
        this.words = draft;
        this.title = chapter.proposal;
    }

    /** Whether the page is still away: *Done* brings it back first. */
    isFolded(): boolean {
        return this.phase === "writing" || this.phase === "folding";
    }

    isRevealed(): boolean {
        return this.phase === "revealed" || this.phase === "revealing";
    }

    /** What you typed, as it stands. */
    text(): string {
        return this.words;
    }

    /**
     * Put the chapter away (FR-2, FR-10): the page slides down as a sheet, and — at the same time — the
     * card is drawn (`open`, by the view) and every mark goes. Resolves once the page is away.
     */
    start(open: () => void): Promise<void> {
        this.phase = "folding";
        const going = this.port.fold("away");
        open();
        this.port.hideMarks();
        return going.then(() => {
            if (this.phase === "folding") this.phase = "writing";
        });
    }

    /** Draw the card into `host`: the panel, a side card or #750's sheet. */
    mount(host: HTMLElement, scope: Component, close?: PanelClose): void {
        this.host = host;
        this.scope = scope;
        this.close = close;
        this.draw();
    }

    /** The card was taken down: nothing of it is kept but its state. */
    unmount(): void {
        this.finish();
        this.host = null;
        this.scope = null;
        this.box = null;
    }

    /** Everything moving now, where it ends (FR-13). */
    finish(): void {
        for (const animation of this.moving.splice(0)) {
            try {
                animation.finish();
            } catch {
                // Already gone.
            }
        }
    }

    /**
     * *Reveal what I marked* (FR-4, FR-11): the sheet slides back up, then — only once it has landed —
     * your marks return in the order you made them, and *What you marked then* fills in beside them.
     */
    async reveal(): Promise<void> {
        if (this.phase !== "writing" && this.phase !== "folding") return;
        this.phase = "revealing";
        this.draw();
        await this.port.fold("back");
        if (this.phase !== "revealing") return;
        this.phase = "revealed";
        this.draw();
        // The rows are drawn while the marks are still away: they come back with them, in order.
        this.port.marksDrawn();
        this.port.revealMarks();
    }

    /** *Done* (FR-7): nothing is written; the words stay as a draft while the Reader is open. */
    done(): void {
        this.keepDraft();
        this.port.done();
    }

    /** What you wrote and did not keep stays as the chapter's draft (FR-7); a kept note leaves none. */
    keepDraft(): void {
        this.port.draft(this.kept ? "" : this.words);
    }

    // ── the card ──────────────────────────────────────────────────────────────

    private draw(): void {
        const host = this.host;
        const scope = this.scope;
        if (!host || !scope) return;
        this.finish();
        // The text box keeps the caret through a redraw: the same element goes back in.
        const box = this.box;
        const focused = box ? box.doc?.activeElement === box : false;
        host.empty();
        const card = host.createDiv({ cls: c("reader-recall") });
        panelHead(card, "reader_recall_panel", this.close);
        card.createDiv({ cls: c("reader-recall-chapter"), text: this.chapter.name });

        // The question, and in its place once you look, *What you wrote*: one cell, so the text
        // under it never moves (FR-12).
        const head = card.createDiv({ cls: c("reader-recall-ask") });
        const question = head.createDiv({ cls: c("reader-recall-question"), text: t("reader_recall_question") });
        const wrote = head.createDiv({ cls: c("reader-recall-wrote"), text: t("reader_recall_wrote") });
        const revealed = this.isRevealed();
        question.toggleClass("is-shown", !revealed);
        wrote.toggleClass("is-shown", revealed);

        const area = this.textBox(card, box);
        if (focused) area.focus();

        const motion = this.port.motion();
        if (!this.settled) {
            this.settled = true;
            // The question rises into place as the sheet goes (FR-10).
            if (motion) {
                const a = rise(question, MOTION.cover);
                if (a) this.moving.push(a);
            }
        }

        if (this.phase === "revealed") this.drawMarks(card);
        else if (this.phase === "revealing" && motion) {
            // The question gives way to *What you wrote* as the sheet comes back: opacity only.
            const out = question.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.base, easing: MOTION.ease });
            const inn = wrote.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base, easing: MOTION.ease });
            for (const a of [out, inn]) if (a) this.moving.push(a);
        }

        if (this.preview) this.drawPreview(card, scope);
        else this.drawActions(card, scope);
    }

    /** The box: yours, exactly — no spellcheck, no autocorrect, no capitals added (FR-3). */
    private textBox(card: HTMLElement, existing: HTMLTextAreaElement | null): HTMLTextAreaElement {
        if (existing) {
            card.appendChild(existing);
            existing.readOnly = this.preview;
            return existing;
        }
        const area = card.createEl("textarea", {
            cls: c("reader-recall-box"),
            attr: {
                rows: "8",
                placeholder: t("reader_recall_placeholder"),
                "aria-label": t("reader_recall_question"),
                spellcheck: "false",
                autocorrect: "off",
                autocapitalize: "off",
                autocomplete: "off",
            },
        });
        area.value = this.words;
        this.scope?.registerDomEvent(area, "input", () => {
            this.words = area.value;
            this.port.draft(this.words);
            this.syncKeep();
        });
        this.box = area;
        return area;
    }

    /** *What you marked then* (FR-4): each mark with its colour, its passage and your note, as you made them. */
    private drawMarks(card: HTMLElement): void {
        const section = card.createDiv({ cls: c("reader-recall-marked") });
        section.createDiv({ cls: c("reader-hl-heading"), text: t("reader_recall_marked") });
        const marks = [...this.port.marks()].sort((a, b) => a.at - b.at);
        if (marks.length === 0) {
            // Said plainly (FR-5): not a failure, not a score.
            section.createDiv({ cls: c("reader-recall-nothing"), text: t("reader_recall_nothing") });
            return;
        }
        for (const thought of marks) {
            const meaning = thought.meaning ?? "idea";
            const row = section.createDiv({ cls: [c("reader-hl-item"), c(`reader-hl-item--${meaning}`), c("reader-recall-mark")], attr: { "data-hl": thought.id } });
            if (thought.quote?.exact) row.createDiv({ cls: c("reader-hl-quote"), text: snippet(thought.quote.exact) });
            if (thought.text.trim()) row.createDiv({ cls: c("reader-hl-note"), text: thought.text.trim() });
        }
    }

    private drawActions(card: HTMLElement, scope: Component): void {
        const foot = card.createDiv({ cls: c("reader-recall-foot") });
        if (this.kept) {
            const line = foot.createDiv({ cls: c("reader-recall-status"), attr: { role: "status" } });
            line.createSpan({ text: this.status ?? (this.kept.flow ? t("reader_recall_flow", this.kept.flow) : t("reader_recall_kept", this.kept.title)) });
            const kept = this.kept;
            if (kept.open) {
                const open = line.createEl("button", { cls: c("reader-recall-link"), attr: { type: "button" }, text: t("reader_export_open") });
                scope.registerDomEvent(open, "click", () => kept.open?.());
            }
            if (kept.undo && !this.status) {
                const undo = line.createEl("button", { cls: c("reader-recall-link"), attr: { type: "button" }, text: t("changes_undo") });
                scope.registerDomEvent(undo, "click", () => void this.undo());
            }
        } else if (this.status) {
            foot.createDiv({ cls: c("reader-recall-status"), attr: { role: "status" }, text: this.status });
        }
        const row = foot.createDiv({ cls: c("reader-recall-actions") });
        if (this.phase === "revealed" && !this.kept) {
            const keep = row.createEl("button", { cls: ["mod-cta", c("reader-recall-keep")], attr: { type: "button" }, text: t("reader_recall_keep") });
            scope.registerDomEvent(keep, "click", () => this.openPreview());
        } else if (!this.isRevealed()) {
            const reveal = row.createEl("button", { cls: ["mod-cta", c("reader-recall-reveal")], attr: { type: "button" }, text: t("reader_recall_reveal") });
            scope.registerDomEvent(reveal, "click", () => void this.reveal());
        }
        const done = row.createEl("button", { cls: c("reader-recall-done"), attr: { type: "button" }, text: t("reader_recall_done") });
        scope.registerDomEvent(done, "click", () => this.done());
        this.syncKeep();
    }

    /** Nothing typed, nothing to keep: the button waits for your words. */
    private syncKeep(): void {
        const keep = this.host?.querySelector<HTMLButtonElement>(`.${c("reader-recall-keep")}`);
        if (keep) keep.disabled = !recallWords(this.words).trim();
    }

    private openPreview(): void {
        if (!recallWords(this.words).trim()) return;
        this.preview = true;
        this.status = null;
        this.draw();
    }

    /**
     * The preview (FR-6): exactly what will be written — the title (editable), your words as you wrote
     * them (read-only, as text, never rendered) and the `source::` line. Nothing until *Create note*.
     */
    private drawPreview(card: HTMLElement, scope: Component): void {
        const preview = card.createDiv({ cls: c("reader-recall-preview") });
        const label = preview.createEl("label", { cls: c("reader-recall-title-label"), text: t("crystallize_note_title") });
        const input = label.createEl("input", { cls: c("reader-recall-title"), attr: { type: "text", spellcheck: "false", autocorrect: "off", autocapitalize: "off" } });
        input.value = this.title;
        scope.registerDomEvent(input, "input", () => (this.title = input.value));
        preview.createEl("pre", { cls: c("reader-recall-note"), text: renderRecallNote(this.words, this.chapter.citation).trimEnd() });
        const flow = this.port.flowName();
        if (flow) preview.createDiv({ cls: c("reader-recall-flow"), text: t("crystallize_continues_in", flow) });
        const row = preview.createDiv({ cls: c("reader-recall-actions") });
        const create = row.createEl("button", { cls: ["mod-cta", c("reader-recall-create")], attr: { type: "button" }, text: flow ? t("crystallize_confirm_flow", flow) : t("reader_recall_create") });
        scope.registerDomEvent(create, "click", () => void this.makeNote());
        const cancel = row.createEl("button", { cls: c("reader-recall-cancel"), attr: { type: "button" }, text: t("reader_recall_cancel") });
        scope.registerDomEvent(cancel, "click", () => {
            // Nothing written: back to what you wrote and what you marked.
            this.preview = false;
            this.draw();
        });
        if (this.box) this.box.readOnly = true;
    }

    private async makeNote(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            const kept = await this.port.keep(this.title.trim() || this.chapter.proposal, this.words);
            this.preview = false;
            if (kept) {
                this.kept = kept;
                this.status = null;
            } else {
                this.status = t("reader_recall_failed");
            }
        } finally {
            this.busy = false;
        }
        if (this.box) this.box.readOnly = false;
        this.draw();
    }

    private async undo(): Promise<void> {
        const kept = this.kept;
        if (!kept?.undo) return;
        const ok = await kept.undo();
        if (ok) {
            // Taken back: the words are still here, to keep again if you want.
            this.kept = null;
            this.status = null;
        } else {
            this.status = t("reader_recall_undo_failed");
        }
        this.draw();
    }
}

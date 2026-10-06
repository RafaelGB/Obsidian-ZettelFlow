import { Component, setIcon, type Scope } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import type { Thought, ThoughtQuote } from "application/thinking/thought";
import { afterReview, type ReviewVerdict } from "application/thinking/highlightReview";

type LocaleKey = Parameters<typeof t>[0];

/** What the cards need from the world. Injected, so the whole look can be walked in a test. */
export interface ReviewDeps {
    store: {
        save(thought: Thought): Promise<void>;
        write(text: string, options: { about?: string; quote?: ThoughtQuote }): Promise<Thought | undefined>;
    };
    /** Your verdict, in the judgement record. Subject and path only — never the words. */
    record(thought: Thought, verdict: "confirmed" | "modified"): void;
    /** Leave the review for the Reader, on the passage. */
    openReader(thought: Thought): void;
    /**
     * Make it a note — Think's own crystallize, behind its own confirmation, on this one highlight.
     * `done` is told the note it wrote, if any.
     */
    toNote(thought: Thought, done: (path?: string) => void): void;
    close(): void;
    now(): number;
}

/** The five things you can do with a card, in the order of their keys. */
const ACTIONS = ["kept", "changed", "reader", "crystallize", "let-go"] as const;
type CardAction = (typeof ACTIONS)[number];

const ACTION_LABEL: Record<CardAction, LocaleKey> = {
    kept: "review_still_think_so",
    changed: "review_changed_my_mind",
    reader: "review_open_reader",
    crystallize: "review_crystallize",
    "let-go": "review_let_it_go",
};

const ACTION_ICON: Record<CardAction, string> = {
    kept: "check",
    changed: "refresh-ccw",
    reader: "book-open",
    crystallize: "gem",
    "let-go": "wind",
};

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** A month and a year — when you marked it, never how many days ago (#563). */
function when(at: number): string {
    return new Date(at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * **A few things you marked** (#678, epic #674): the highlights that are due, one card at a time,
 * set in the Reader's own type.
 *
 * Each card asks one question of a past judgement and offers five answers. Nothing here counts —
 * not what is left, not what you missed, not how many days in a row. A card you leave is simply
 * there again next time, exactly as it was.
 */
export class ReviewCards extends Component {
    private index = 0;
    /** The card whose *changed my mind* field is open. */
    private changing = false;
    private draft = "";
    private busy = false;
    private fieldEl: HTMLTextAreaElement | undefined;
    private renderScope: Component | undefined;

    constructor(
        private readonly host: HTMLElement,
        private readonly cards: Thought[],
        private readonly deps: ReviewDeps
    ) {
        super();
    }

    onload(): void {
        this.render();
    }

    onunload(): void {
        this.renderScope?.unload();
        this.host.empty();
    }

    /** The card on screen, or nothing once the few are done. */
    public current(): Thought | undefined {
        return this.cards[this.index];
    }

    /**
     * The keys, on the modal's own scope: `1`–`5` answer, the arrows move between cards without
     * answering, and Esc is the modal's. A key pressed while you write is the field's, never ours.
     */
    public keys(scope: Scope): void {
        const writing = () => this.changing && this.host.ownerDocument?.activeElement === this.fieldEl;
        ACTIONS.forEach((action, i) => {
            scope.register([], String(i + 1), () => {
                if (writing() || !this.current()) return true;
                void this.act(action);
                return false;
            });
        });
        scope.register([], "ArrowRight", () => {
            if (writing()) return true;
            this.move(1);
            return false;
        });
        scope.register([], "ArrowLeft", () => {
            if (writing()) return true;
            this.move(-1);
            return false;
        });
        scope.register(["Mod"], "Enter", () => {
            if (!this.changing) return true;
            void this.commitChange();
            return false;
        });
    }

    /** Do what a button would. Public so a door and a key share one path. */
    public async act(action: CardAction): Promise<void> {
        const card = this.current();
        if (!card || this.busy) return;
        switch (action) {
            case "kept":
                this.deps.record(card, "confirmed");
                await this.answer(card, "kept");
                return;
            case "changed":
                this.changing = true;
                this.render();
                this.fieldEl?.focus();
                return;
            case "reader":
                this.deps.openReader(card);
                return;
            case "crystallize":
                this.deps.toNote(card, (path) => {
                    if (path) this.advance();
                });
                return;
            case "let-go":
                await this.answer(card, "let-go");
                return;
        }
    }

    private move(step: number): void {
        const next = this.index + step;
        if (next < 0 || next > this.cards.length) return;
        this.index = next;
        this.changing = false;
        this.draft = "";
        this.render();
    }

    private advance(): void {
        this.index += 1;
        this.changing = false;
        this.draft = "";
        this.render();
    }

    /** Write the verdict back into the highlight's own file, then the next card. */
    private async answer(card: Thought, verdict: ReviewVerdict): Promise<void> {
        this.busy = true;
        try {
            const updated = afterReview(card, verdict, this.deps.now());
            await this.deps.store.save(updated);
            this.cards[this.index] = updated;
        } catch (error) {
            log.error("[review] could not record the review", error);
        } finally {
            this.busy = false;
        }
        this.advance();
    }

    /** What you think now, written as a thought of its own beside the old one. */
    private async commitChange(): Promise<void> {
        const card = this.current();
        const text = this.draft.trim();
        if (!card || !text || this.busy) return;
        this.busy = true;
        try {
            await this.deps.store.write(text, card.about ? { about: card.about } : {});
            this.deps.record(card, "modified");
        } catch (error) {
            log.error("[review] could not write what you think now", error);
            this.busy = false;
            return;
        }
        this.busy = false;
        await this.answer(card, "changed");
    }

    private render(): void {
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        this.host.empty();
        const root = this.host.createDiv({ cls: c("review") });

        const card = this.current();
        if (!card) {
            this.renderEnd(root, scope);
            return;
        }

        const box = root.createDiv({ cls: [c("review-card"), c("review-card--enter")] });
        box.createDiv({ cls: c("review-quote"), text: card.quote?.exact ?? "" });
        const about = card.about ?? "";
        const meta = box.createDiv({ cls: c("review-meta") });
        const place = card.quote?.heading ? `${noteName(about)} › ${card.quote.heading}` : noteName(about);
        meta.createSpan({ text: t("review_marked_in", place, when(card.at)) });
        if (card.text.trim()) box.createDiv({ cls: c("review-note"), text: card.text.trim() });
        box.createDiv({ cls: c("review-ask"), text: t("review_question") });

        if (this.changing) this.renderChange(box, scope);
        else this.renderActions(box, scope);

        this.renderDots(root, scope);
    }

    private renderActions(box: HTMLElement, scope: Component): void {
        const row = box.createDiv({ cls: c("review-actions") });
        ACTIONS.forEach((action, i) => {
            const button = row.createEl("button", {
                cls: [c("review-action"), ...(action === "kept" ? ["mod-cta"] : [])],
                attr: { type: "button", "aria-keyshortcuts": String(i + 1) },
            });
            setIcon(button.createSpan({ cls: c("review-action-icon") }), ACTION_ICON[action]);
            button.createSpan({ text: t(ACTION_LABEL[action]) });
            button.createEl("kbd", { cls: c("review-kbd"), text: String(i + 1) });
            scope.registerDomEvent(button, "click", () => void this.act(action));
        });
    }

    private renderChange(box: HTMLElement, scope: Component): void {
        const wrap = box.createDiv({ cls: c("review-change") });
        const field = wrap.createEl("textarea", {
            cls: c("review-change-field"),
            attr: { rows: "3", placeholder: t("review_change_placeholder"), "aria-label": t("review_changed_my_mind") },
        });
        field.value = this.draft;
        this.fieldEl = field;
        scope.registerDomEvent(field, "input", () => (this.draft = field.value));
        const row = wrap.createDiv({ cls: c("review-actions") });
        const save = row.createEl("button", { cls: "mod-cta", text: t("review_change_save"), attr: { type: "button" } });
        scope.registerDomEvent(save, "click", () => void this.commitChange());
        const cancel = row.createEl("button", { text: t("review_change_cancel"), attr: { type: "button" } });
        scope.registerDomEvent(cancel, "click", () => {
            this.changing = false;
            this.draft = "";
            this.render();
        });
    }

    /** Where you are among the few — dots, never a number. */
    private renderDots(root: HTMLElement, scope: Component): void {
        if (this.cards.length < 2) return;
        const dots = root.createDiv({ cls: c("review-dots") });
        this.cards.forEach((_card, i) => {
            const dot = dots.createEl("button", {
                cls: [c("review-dot"), ...(i === this.index ? ["is-active"] : [])],
                attr: { type: "button", "aria-label": t("review_go_to_card") },
            });
            scope.registerDomEvent(dot, "click", () => {
                this.index = i;
                this.changing = false;
                this.render();
            });
        });
    }

    private renderEnd(root: HTMLElement, scope: Component): void {
        const end = root.createDiv({ cls: [c("review-end"), c("review-card--enter")] });
        end.createDiv({ cls: c("review-end-title"), text: t(this.cards.length ? "review_done" : "review_nothing") });
        end.createDiv({ cls: c("review-end-sub"), text: t("review_done_sub") });
        const close = end.createEl("button", { cls: "mod-cta", text: t("review_close"), attr: { type: "button" } });
        scope.registerDomEvent(close, "click", () => this.deps.close());
    }
}

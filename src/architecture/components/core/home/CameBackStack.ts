import { Component, setIcon, type App } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { ReviewCards } from "architecture/components/core/review/ReviewCards";
import { reviewDeps } from "architecture/components/core/review/ReviewModal";
import { openReturn } from "starters/zcomponents/ClaimReturnComponent";
import { cameBackOrder, dayKey, type CameBackItem } from "./cameBack";
import type { DueClaim } from "architecture/knowledge/state";

/** What you let go today, for the rest of the day — in memory, never written (§XII). */
const LET_GO = new Set<string>();

/** A month and a year, in the reader's locale. Never a count of days (#563). */
function when(at: number): string {
    return new Date(at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * **Came back today**, as one quiet stack (#704). The top card is answered in place; the next two
 * peek from behind it; answering the last one leaves one line — *That is all for today.*
 *
 * The highlights are Think's own review cards (`ReviewCards`), mounted here rather than in a modal,
 * with the same answers and the same writes; a claim or a wager opens its return, or is let go for
 * the day. Nothing is drawn on a day nothing came back — the caller does not mount the stack then.
 */
export class CameBackStack extends Component {
    private items: CameBackItem[] = [];
    private cards: ReviewCards | undefined;
    private renderScope: Component | undefined;
    private gone = false;

    constructor(
        private readonly host: HTMLElement,
        private readonly app: App,
        private readonly due: { highlightsDue: boolean; claim: DueClaim | null },
        private readonly now: () => number = () => Date.now()
    ) {
        super();
    }

    onload(): void {
        this.items = cameBackOrder({ ...this.due, letGo: LET_GO, now: this.now() });
        this.render();
    }

    onunload(): void {
        this.gone = true;
        this.cards?.unload();
        this.renderScope?.unload();
        this.host.empty();
    }

    private next(): void {
        this.items.shift();
        this.render();
    }

    private render(): void {
        this.cards?.unload();
        this.cards = undefined;
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        this.host.empty();
        const stack = this.host.createDiv({ cls: c("home-stack") });
        const [top, ...behind] = this.items;
        if (!top) {
            const done = stack.createDiv({ cls: c("home-stack-done") });
            setIcon(done.createSpan({ cls: c("home-stack-done-icon") }), "check");
            done.createSpan({ text: t("home_stack_done") });
            return;
        }
        const card = stack.createDiv({ cls: [c("home-stack-card"), c("family-card")] });
        if (top.kind === "highlights") this.renderHighlights(card);
        else this.renderClaim(card, top.claim, scope);
        // The next ones peek from behind — a stack you can see the depth of, never a number.
        behind.slice(0, 2).forEach((_item, depth) => {
            stack.createDiv({ cls: [c("home-stack-ghost"), c(`home-stack-ghost--${depth + 1}`)], attr: { "aria-hidden": "true" } });
        });
    }

    private renderHighlights(card: HTMLElement): void {
        const from = card.createDiv({ cls: c("home-stack-from") });
        setIcon(from.createSpan({ cls: c("home-stack-from-icon") }), "highlighter");
        from.createSpan({ text: t("review_title") });
        const body = card.createDiv();
        void ThoughtStore.getInstance()
            .dueHighlights(this.now())
            .then((due) => {
                if (this.gone) return;
                if (due.length === 0) {
                    this.next();
                    return;
                }
                const deps = { ...reviewDeps(this.app, () => this.next()), onEnd: () => this.next() };
                this.cards = new ReviewCards(body, due, deps);
                this.cards.load();
            })
            .catch((error) => {
                log.warn("[home] could not read what came back", error);
                this.next();
            });
    }

    private renderClaim(card: HTMLElement, due: DueClaim, scope: Component): void {
        const wager = due.kind === "wager";
        const from = card.createDiv({ cls: c("home-stack-from") });
        setIcon(from.createSpan({ cls: c("home-stack-from-icon") }), wager ? "calendar-check" : "file-text");
        from.createSpan({
            text: wager ? t("home_claim_return_wager_when", when(due.lastTouched)) : t("home_claim_return_when", when(due.lastTouched)),
        });
        if (due.claim.trim()) card.createEl("blockquote", { cls: [c("home-stack-quote"), c("family-idea-text")], text: due.claim.trim() });
        card.createDiv({
            cls: c("home-stack-mine"),
            text: t(wager ? "home_claim_return_wager_title" : "home_claim_return_title"),
        });
        const answers = card.createDiv({ cls: c("home-stack-answers") });
        const open = answers.createEl("button", {
            cls: "mod-cta",
            text: t(wager ? "home_claim_return_wager_open" : "home_claim_return_open"),
            attr: { type: "button" },
        });
        scope.registerDomEvent(open, "click", () => {
            const plugin = ObsidianApi.getOwnPlugin();
            // `derived` — the system brought it back. Opening it yourself records `human` (#562).
            if (plugin) openReturn(plugin, due.path, "derived");
            this.next();
        });
        const later = answers.createEl("button", {
            text: t(wager ? "home_stack_not_yet" : "review_let_it_go"),
            attr: { type: "button" },
        });
        scope.registerDomEvent(later, "click", () => {
            // Your attention, not a verdict: nothing is recorded, and it is back tomorrow.
            LET_GO.add(`${dayKey(this.now())}:${due.path}`);
            this.next();
        });
    }
}

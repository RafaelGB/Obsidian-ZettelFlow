import { displayName } from "application/library/displayName";
import { meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { App, moment as obsidianMoment, setIcon, setTooltip } from "obsidian";
import type MomentFn from "moment";
import { openReader } from "architecture/components/core/reader/openReader";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { ModeHeader } from "architecture/components/core/surface/ModeHeader";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { isInk, linkThoughts, thoughtPath, type ResponseKind, type Thought } from "application/thinking/thought";
import { renderInkCard } from "./labInkCard";
import { flattenThread, threadThoughts, type ThoughtNode } from "application/thinking/thread";
import { searchThreads, isEmptyQuery, type LabQuery } from "application/thinking/labSearch";
import { parseTags } from "application/thinking/tags";
import { LAB_PAGE, windowOf, grow, ensureIndexShown } from "application/thinking/labPage";
import {
    dayKey,
    presentDays,
    presentMonths,
    monthDays,
    leadingBlanks,
    monthsOfYear,
} from "application/thinking/labCalendar";
import { keyFor, keyLabel, LAB_KEYS, moveFor, type LabMove } from "application/thinking/labKeys";
import { LAB_MOVE_VOCABULARY, MOVE_VERBS, type MovePrimitive } from "application/thinking/move";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { planCrystallization } from "application/thinking/crystallize";
import { commitDraft } from "application/thinking/commit";
import { appearedSince, isIncubated, pickBackUp, setAside } from "application/thinking/incubation";
import { KnowledgeIndex } from "architecture/knowledge";
import { CrystallizeModal } from "./CrystallizeModal";
import { CollisionPanel } from "./CollisionPanel";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { drawCollision, type Collision, type CollisionDistance } from "architecture/knowledge/state";
import { dueHighlights } from "application/thinking/highlightReview";
import { openReview } from "architecture/components/core/review/ReviewModal";

const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];

/** How long after you stop typing an **existing** thought is written back to its file. */
const EDIT_SAVE_AFTER_MS = 600;

/**
 * **The Thought Lab** (#467, epic #465) — a mode of the Home surface.
 *
 * A place to think before it has to be knowledge. You write; you contradict yourself underneath;
 * you connect the two. Nothing here is a note, nothing has a state, nothing can be an orphan, and
 * nothing appears in Health — that guarantee is #466's, inherited from the scope exclusion.
 *
 * ## Why nothing is committed on a timer
 *
 * The first version saved a new thought on a debounce, and it was unusable: a pause to think
 * turned half a sentence into a card, the surface rebuilt itself, and the cursor was gone. **A
 * pause while writing is thinking, not a boundary.**
 *
 * So a new thought is committed only at a real boundary — `Ctrl`/`Cmd`+`Enter`, or leaving the
 * box — and committing **never rebuilds the surface**: the card is inserted and the composer
 * cleared in place. Editing an existing thought does save on a debounce, because there the file
 * already exists and nothing moves on screen.
 *
 * Nothing redraws while a text box has focus, and that rule lives in exactly one place:
 * {@link refresh}.
 *
 * ## Four moves, and there will not be a fifth
 *
 * Fork and challenge do not create an empty card either. They **arm the composer**, so a relation
 * costs a sentence rather than an empty file you have to go back and fill.
 */

/** How close to the foot of the scroller brings the next page in. A feel, not a grid value. */
const LAB_SCROLL_MARGIN = 480;

/** Monday, like most of the calendar-using world. Obsidian exposes no week-start we could read here. */
const WEEK_STARTS_ON = 1;


/** The name each highlight meaning shows in Think (#720); a literal map for the locale guardrail. */
const LAB_MEANING_LABEL: Record<HighlightMeaning, Parameters<typeof t>[0]> = {
    idea: "reader_hl_meaning_idea",
    question: "reader_hl_meaning_question",
    quote: "reader_hl_meaning_quote",
    discuss: "reader_hl_meaning_discuss",
};
export class LabRenderer extends KnowledgeModeRenderer {
    private thoughts: Thought[] = [];

    /** The composer's text. Held here, not in the DOM, so a redraw can never lose it. */
    private draft = "";
    /** What the next committed thought will be to an existing one. */
    private relation: { to: string; as: ResponseKind } | undefined;

    private editTimer: number | undefined;
    private pendingEdit: (() => Promise<void>) | undefined;

    /** Set when connect is armed: the next thought you pick joins this one. */
    private connecting: string | undefined;
    /** What you have picked out as maybe being an idea. Empty is the normal state. */
    private selected = new Set<string>();
    /**
     * Whether what was set aside is on screen. **Off by default, and it is not a count** — you
     * come back because you decided to, never because something told you how many were waiting.
     */
    private showingAside = false;
    /** Whether the short explanation of the moves is on screen. */
    private showingLegend = false;
    /** Whether the collision panel is open. A choice, never a mode you are put into (#567). */
    private colliding = false;
    private collision: CollisionPanel | undefined;
    /** The note a collision is anchored to, when you arrived here from one (#569). */
    private anchor: string | undefined;
    /** The second note a thought is about, when it came out of a collision. */
    private alsoAbout: string | undefined;

    /** What you are looking for. Empty is the normal state, and it shows everything. */
    private filter = "";
    /** Tag chips you have clicked to narrow by — a thought must carry all of them (#596). */
    private readonly activeTags = new Set<string>();
    /** Highlights of one meaning only, when you clicked one on a card (#720). */
    private activeMeaning: HighlightMeaning | null = null;
    /** The find input, so `/` can focus it (#596). */
    private findInputEl: HTMLInputElement | undefined;
    /** The set-aside region, kept as one element so the find bar can refresh it without a full redraw. */
    private asideEl: HTMLElement | undefined;
    /** Threads you have folded away. View state: it survives a redraw, not a restart. */
    private readonly collapsed = new Set<string>();
    /** Where you were, so returning is as cheap as arriving. */
    private scrollTop = 0;

    /**
     * How many top-level threads are on screen (#596). Infinite scroll grows it, newest first; it is
     * **never** shown as a number, because "how many are left" is the debt the Lab refuses (#469).
     */
    private shown = LAB_PAGE;
    /** The filtered roots currently backing the list, so growing appends without recomputing. */
    private roots: ThoughtNode[] = [];
    /** The "older thoughts" affordance at the foot of the window, removed and re-added as it grows. */
    private sentinelEl: HTMLElement | undefined;
    /** Whether the calendar panel — the other way into time — is open. Off by default. */
    private calendarOpen = false;
    /** Which year and month the calendar is showing, and whether it shows days or months. */
    private calYear = new Date().getFullYear();
    private calMonth = new Date().getMonth();
    private calMode: "days" | "months" = "days";

    /** The thought the keys act on. Visible, never guessed. */
    private focused: string | undefined;
    /** Every node on screen, in the order the eye reads them — what `next`/`previous` walk. */
    private order: ThoughtNode[] = [];

    private listEl: HTMLElement | undefined;
    /** Where each thought is on screen, so following a connection can actually go somewhere. */
    private readonly cards = new Map<string, HTMLElement>();
    private composerEl: HTMLTextAreaElement | undefined;
    /** The line under the composer: how to save, or why the last attempt did not. */
    private hintEl: HTMLElement | undefined;

    constructor(
        container: HTMLElement,
        private readonly app: App,
        /** The note this visit is about, when you arrived from one (#473). */
        private about?: string,
        /**
         * The move that opened this space (#499) — a **frame**, and only that: a placeholder
         * naming what you came here to do, plus the move recorded when you write. It is
         * deliberately not a `ResponseKind` and not a field on the thought: eleven frames must
         * not become eleven kinds of edge.
         *
         * Consumed once. A frame that outlived its thought would silently mislabel the next one.
         */
        private frame?: string
    ) {
        super(container);
    }

    onload(): void {
        // View-local, so a single letter never steals a key from the rest of Obsidian.
        this.registerDomEvent(this.container, "keydown", (event: KeyboardEvent) => this.onKey(event));
        // Infinite scroll: the container is the scroller, and the window grows as you near the foot.
        this.registerDomEvent(this.container, "scroll", () => this.onScroll());
        void this.readLab();
    }

    /**
     * A keystroke, when you are not writing.
     *
     * Writing wins over shortcuts, always: inside a text box a letter is a letter. That is the
     * rule that makes single-key moves safe in a surface whose whole purpose is typing.
     */
    private onKey(event: KeyboardEvent): void {
        const target = event.target;
        const writing =
            target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
        if (writing && event.key !== "Escape") return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        const move = moveFor(event.key, event.shiftKey);
        if (!move) return;
        event.preventDefault();
        this.run(move);
    }

    private run(move: LabMove): void {
        if (move === "next" || move === "previous") return this.step(move === "next" ? 1 : -1);
        if (move === "find") {
            this.findInputEl?.focus();
            return;
        }
        if (move === "leave") {
            const active = this.container.ownerDocument.activeElement;
            if (active instanceof HTMLElement) active.blur();
            return;
        }
        if (move === "crystallize") {
            if (this.selected.size > 0) this.openCrystallize();
            return;
        }
        const node = this.order.find((entry) => entry.thought.id === this.focused);
        if (!node) return;
        const thought = node.thought;
        const whole = flattenThread(node);
        switch (move) {
            case "fork":
                return this.arm("fork", thought);
            case "challenge":
                return this.arm("challenge", thought);
            case "connect":
                return void this.connect(thought);
            case "pick":
                return this.togglePick(thought.id);
            case "setAside":
                return void this.aside(whole, "not-now");
            case "decidedAgainst":
                return void this.aside(whole, "decided-against");
            case "discard": {
                const card = this.cards.get(thought.id);
                if (card) void this.discard(whole, card);
                return;
            }
            default:
                return;
        }
    }

    /**
     * Write a Lab gesture down as a move (#492), inheriting the lineage of whatever it acted on.
     *
     * The parent comes for free: the most recent move on the thought you acted on *is* what this
     * one came out of, so a genealogy builds itself with nothing to maintain. Never throws and
     * never blocks — the gesture already happened; the record is bookkeeping around it.
     */
    private remember(move: LabMove, subject: string, produced?: string): void {
        const vocabulary = LAB_MOVE_VOCABULARY[move];
        if (!vocabulary) return;
        this.write(vocabulary.primitive, vocabulary.verb, subject, produced);
    }

    /** A move made **on a note**, whose result is the thought you just wrote (#500). */
    private rememberFramed(verb: string, note: string, thought: string): void {
        const entry = MOVE_VERBS.find((candidate) => candidate.verb === verb);
        if (!entry) return;
        this.write(entry.primitive, entry.verb, note, thought);
    }

    private write(primitive: MovePrimitive, verb: string, subject: string, produced?: string): void {
        const log = MoveLog.getInstance();
        const history = log.forSubject(subject);
        const from = history.length > 0 ? history[history.length - 1].id : undefined;
        log.record({
            primitive,
            verb,
            subject,
            ...(produced ? { produced } : {}),
            ...(from ? { from } : {}),
        });
    }

    /** Move the focus, and bring it into view. Wraps, because a list you fall off the end of is worse. */
    private step(by: number): void {
        if (this.order.length === 0) return;
        const at = this.order.findIndex((entry) => entry.thought.id === this.focused);
        const next = at === -1 ? 0 : (at + by + this.order.length) % this.order.length;
        this.focus(this.order[next].thought.id);
    }

    private focus(id: string): void {
        for (const card of this.cards.values()) card.removeClass(c("lab-focused"));
        this.focused = id;
        const card = this.cards.get(id);
        if (!card) return;
        card.addClass(c("lab-focused"));
        card.scrollIntoView({ block: "nearest" });
    }

    private togglePick(id: string): void {
        if (this.selected.has(id)) this.selected.delete(id);
        else this.selected.add(id);
        this.redrawAfterAction();
    }

    onunload(): void {
        this.flush();
        this.container.empty();
    }

    private async readLab(): Promise<void> {
        try {
            this.thoughts = await ThoughtStore.getInstance().all();
        } catch (error) {
            log.warn("[lab] could not read the lab", error);
            this.thoughts = [];
        }
        this.render();
    }

    /**
     * Redraw — unless you are in the middle of a sentence.
     *
     * For changes that arrive **while you write**. The guard exists so typing can never move the
     * ground under you; it is not a veto on things you asked for. An action you took goes through
     * {@link redrawAfterAction} instead — restoring a thought and never seeing it come back is
     * exactly what this guard caused when it was used for both.
     */
    private refresh(): void {
        const active = this.container.ownerDocument.activeElement;
        if (active instanceof HTMLTextAreaElement && this.container.contains(active)) return;
        this.render();
    }

    /** Redraw because *you* did something. Always happens, and the cursor goes back where it was. */
    private redrawAfterAction(): void {
        const wasComposing = this.container.ownerDocument.activeElement === this.composerEl;
        this.render();
        if (wasComposing) this.composerEl?.focus();
    }

    private render(): void {
        const host = this.container;
        this.scrollTop = host.scrollTop || this.scrollTop;
        host.empty();
        this.cards.clear();
        host.addClass(c("lab"));

        if (!ThoughtStore.getInstance().folder()) {
            host.createDiv({ cls: c("lab-empty"), text: t("lab_no_folder") });
            return;
        }

        const header = host.createDiv({ cls: c("lab-header") });
        const said = header.createDiv();
        said.createDiv({ cls: c("lab-intro"), text: t("lab_intro") });
        const actions = header.createDiv({ cls: c("lab-header-actions") });
        // One primary, and it is the collision: the one control here that *starts something*
        // (#577). Crystallize is not a candidate — it lives in the picked bar, on the selection it
        // acts upon, and promoting it would put a permanently inert button in the header, which is
        // exactly the clutter #542 removed. The legend explains; it does not open anything.
        const bar = new ModeHeader(actions, (el, type, handler) => this.registerDomEvent(el, type, handler));
        bar.primary({
            label: this.colliding ? t("collision_close") : t("collision_open"),
            icon: "shuffle",
            onClick: () => {
                this.colliding = !this.colliding;
                if (!this.colliding) {
                    this.anchor = undefined;
                    this.forgetPair();
                }
                this.render();
            },
        });
        bar.secondary({
            label: t("lab_legend_open"),
            icon: "help-circle",
            onClick: () => {
                this.showingLegend = !this.showingLegend;
                this.render();
            },
        });
        bar.done();
        if (this.showingLegend) this.renderLegend(host);

        // *Make a move… → analogy* on a note arrives here framed, with the note as the subject
        // (#499). Nothing in the move vocabulary changed to make this happen: the verb already
        // opens the thinking space, and this is what the space now does when it does.
        if (this.frame === "analogy" && this.about && !this.colliding && !this.anchor) {
            this.anchor = this.about;
            this.colliding = true;
        }

        if (this.colliding) {
            const panel = host.createDiv();
            this.collision?.unload();
            this.collision = new CollisionPanel(panel, {
                draw: (distance: CollisionDistance) => this.drawPair(distance),
                card: (path: string) => this.cardFor(path),
                open: (path: string) => void this.app.workspace.openLinkText(path, "", false),
                onPair: (pair: Collision | null) => this.armPair(pair),
                // Absent when the record is off, so the control is never there to do nothing.
                ...(JudgementLog.getInstance().enabled()
                    ? {
                          dismiss: (pair: Collision) =>
                              JudgementLog.getInstance().recordCollisionVerdict(pair.a, pair.b),
                      }
                    : {}),
            });
            this.addChild(this.collision);
        }

        // The banner names *the* note a thread came from. A collision has two, and the panel above
        // is already showing both — a banner naming one of them would be a third, wrong, answer.
        if (this.about && !this.colliding) {
            const banner = host.createDiv({ cls: c("lab-about-banner") });
            setIcon(banner.createSpan({ cls: c("lab-subject-icon") }), "file-text");
            banner.createSpan({
                text: t("lab_thinking_about", (this.about.split("/").pop() ?? this.about).replace(/\.md$/, "")),
            });
            this.ghostAction(banner, t("lab_about_leave"), "x", () => {
                this.about = undefined;
                this.render();
            });
        }

        this.renderReviewDoor(host);
        this.renderComposer(host);
        if (this.selected.size > 0) this.renderPicked(host);

        // Always available now: finding is a retrieval aid, not something you earn at eight thoughts.
        this.renderFindBar(host);
        // The other way into time: a calendar to jump to a day, a month, a year (#596). Off by default.
        if (this.calendarOpen) this.renderCalendar(host);

        // Threads, not a pile sorted by clock: a counterpoint belongs under what it answers. The list
        // is a window on them, newest first, that grows as you scroll — never the whole pile at once.
        this.listEl = host.createDiv({ cls: c("lab-list") });
        // The set-aside region lives in one element so the find bar can refresh it in place.
        this.asideEl = host.createDiv();
        this.renderList();

        // Returning should be as cheap as arriving.
        if (this.scrollTop > 0) window.setTimeout(() => (host.scrollTop = this.scrollTop), 0);
    }

    /**
     * Something you marked in the Reader is back for a second look (#678). One line, on the days
     * there is something and on no other — never a count, never what you skipped.
     */
    private renderReviewDoor(host: HTMLElement): void {
        if (dueHighlights(this.thoughts, Date.now(), 1).length === 0) return;
        const line = host.createDiv({ cls: c("lab-review-door") });
        setIcon(line.createSpan({ cls: c("lab-subject-icon") }), "highlighter");
        line.createSpan({ cls: c("lab-review-door-text"), text: t("review_lab_line") });
        const open = line.createEl("button", { cls: "mod-cta", text: t("review_home_open"), attr: { type: "button" } });
        this.registerDomEvent(open, "click", () => void openReview(this.app));
    }

    /**
     * What the moves do, in one sentence each (#467 follow-up).
     *
     * The icons are quick once you know them and opaque until you do, so the explanation is a
     * click away rather than absent — and closed by default, because a legend you cannot dismiss
     * is clutter for everyone who already read it.
     */
    private renderLegend(host: HTMLElement): void {
        const legend = host.createDiv({ cls: c("lab-legend") });
        const rows: [string, string, string][] = [
            ["git-branch", t("lab_fork"), t("lab_legend_fork")],
            ["swords", t("lab_challenge"), t("lab_legend_challenge")],
            ["link", t("lab_connect"), t("lab_legend_connect")],
            ["moon", t("lab_set_aside"), t("lab_legend_set_aside")],
            ["archive", t("lab_decided_against"), t("lab_legend_decided_against")],
            ["gem", t("lab_crystallize"), t("lab_legend_crystallize")],
            ["trash-2", t("lab_discard"), t("lab_legend_discard")],
        ];
        for (const [icon, name, what] of rows) {
            const row = legend.createDiv({ cls: c("lab-legend-row") });
            setIcon(row.createSpan({ cls: c("lab-legend-icon") }), icon);
            row.createSpan({ cls: c("lab-legend-name"), text: name });
            row.createSpan({ cls: c("lab-legend-what"), text: what });
            const entry = LAB_KEYS.find((key) => t(key.labelKey as LocaleKey) === name);
            if (entry) row.createSpan({ cls: c("lab-legend-key"), text: keyLabel(entry) });
        }

        // Moving around is a move too, and the least discoverable of them.
        for (const move of ["find", "next", "previous", "leave"] as const) {
            const entry = keyFor(move);
            if (!entry) continue;
            const row = legend.createDiv({ cls: c("lab-legend-row") });
            row.createSpan({ cls: c("lab-legend-icon") });
            row.createSpan({ cls: c("lab-legend-name"), text: t(entry.labelKey as LocaleKey) });
            row.createSpan({ cls: c("lab-legend-what"), text: "" });
            row.createSpan({ cls: c("lab-legend-key"), text: keyLabel(entry) });
        }
    }

    /**
     * One always-on find bar (#596): free text over the body, its `#tags`, and the subject note, plus
     * the tag chips you have clicked to narrow by. It narrows and never reorders — a tool you pick up,
     * not a queue you are handed (#469): no saved filter, no suggestion, no count.
     */
    private renderFindBar(host: HTMLElement): void {
        const bar = host.createDiv({ cls: c("lab-filter") });
        setIcon(bar.createSpan({ cls: c("lab-filter-icon") }), "search");
        const input = bar.createEl("input", {
            type: "text",
            cls: c("lab-filter-input"),
            attr: { placeholder: t("lab_filter_placeholder") },
        });
        input.value = this.filter;
        this.findInputEl = input;
        // List-only redraw: a full render would let the composer's auto-focus steal the cursor. A new
        // query starts at the top of its results, so the window resets to the first page.
        this.registerDomEvent(input, "input", () => {
            this.filter = input.value;
            this.shown = LAB_PAGE;
            this.renderList();
        });
        for (const tag of this.activeTags) {
            const chip = bar.createEl("button", {
                cls: [c("lab-tag-chip"), "is-active"].join(" "),
                attr: { type: "button", "aria-label": t("lab_tag", tag) },
            });
            chip.createSpan({ text: `#${tag}` });
            setIcon(chip.createSpan({ cls: c("lab-tag-remove") }), "x");
            this.registerDomEvent(chip, "click", () => {
                this.activeTags.delete(tag);
                this.shown = LAB_PAGE;
                this.render();
            });
        }
        if (this.activeMeaning) {
            const meaning = this.activeMeaning;
            const chip = bar.createEl("button", {
                cls: [c("lab-tag-chip"), c("lab-meaning-chip"), c(`lab-meaning-chip--${meaning}`), "is-active"].join(" "),
                attr: { type: "button", "aria-label": t("lab_meaning_filter", t(LAB_MEANING_LABEL[meaning])) },
            });
            chip.createSpan({ cls: [c("lab-meaning-swatch"), c(`lab-meaning-swatch--${meaning}`)].join(" ") });
            chip.createSpan({ text: t(LAB_MEANING_LABEL[meaning]) });
            setIcon(chip.createSpan({ cls: c("lab-tag-remove") }), "x");
            this.registerDomEvent(chip, "click", () => this.toggleMeaning(meaning));
        }
        if (this.filter || this.activeTags.size > 0 || this.activeMeaning) {
            this.ghostAction(bar, t("lab_filter_clear"), "x", () => {
                this.filter = "";
                this.activeTags.clear();
                this.activeMeaning = null;
                this.shown = LAB_PAGE;
                this.render();
            });
        }
        // The calendar toggle: the other way into time, tucked at the end of the find bar.
        const cal = bar.createEl("button", {
            cls: ["clickable-icon", c("lab-cal-toggle")].join(" "),
            attr: { type: "button", "aria-label": t("lab_calendar") },
        });
        setIcon(cal, "calendar");
        if (this.calendarOpen) cal.addClass("is-active");
        this.registerDomEvent(cal, "click", () => this.toggleCalendar());
    }

    /** The current find query, from the text box and the active tag chips. */
    private query(): LabQuery {
        return {
            text: this.filter,
            ...(this.activeTags.size > 0 ? { tags: [...this.activeTags] } : {}),
            ...(this.activeMeaning ? { meaning: this.activeMeaning } : {}),
        };
    }

    /** Show only highlights of this meaning, or everything again (clicked from a card's chip, #720). */
    private toggleMeaning(meaning: HighlightMeaning): void {
        this.activeMeaning = this.activeMeaning === meaning ? null : meaning;
        this.shown = LAB_PAGE;
        this.render();
    }

    /** Toggle a tag as an active filter (clicked from a card's chip). */
    private toggleTag(tag: string): void {
        if (this.activeTags.has(tag)) this.activeTags.delete(tag);
        else this.activeTags.add(tag);
        this.shown = LAB_PAGE;
        this.render();
    }

    /** Redraw only the results, so typing in the find bar never touches the box you are typing in. */
    private renderList(): void {
        this.paintList();
        // Keep the set-aside matches in step with the query, without disturbing the find input.
        if (this.asideEl) {
            this.asideEl.empty();
            this.renderAsideDoor(this.asideEl, this.thoughts.filter(isIncubated));
        }
    }

    /**
     * Paint the current window of filtered roots into the list (#596). Newest first, and only the
     * first `shown` of them — the rest arrive as you scroll. Shared by the full render and the
     * list-only redraw, so the two can never fall out of step.
     */
    private paintList(): void {
        const list = this.listEl;
        if (!list) return;
        list.empty();
        this.cards.clear();
        this.order = [];
        this.sentinelEl = undefined;
        const open = this.thoughts.filter((thought) => !isIncubated(thought));
        const query = this.query();
        this.roots = searchThreads(threadThoughts(open), query);
        if (this.roots.length === 0) {
            list.createDiv({
                cls: c("lab-blank"),
                text: isEmptyQuery(query) ? t("lab_blank") : t("lab_filter_nothing"),
            });
        }
        const { items, hasMore } = windowOf(this.roots, this.shown);
        for (const node of items) this.renderNode(list, node);
        if (hasMore) this.addSentinel(list);
        if (this.focused && this.cards.has(this.focused)) this.focus(this.focused);
        // If the first window does not fill the view, grow until it does — otherwise a tall screen
        // could leave threads unreachable because there is nothing to scroll.
        window.setTimeout(() => this.fillViewport(), 0);
    }

    /** The scroller neared its foot — bring the next page of older threads into the window. */
    private onScroll(): void {
        const el = this.container;
        if (this.shown >= this.roots.length) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - LAB_SCROLL_MARGIN) this.growList();
    }

    /** Append one page more of older threads, in place — no full redraw, so your scroll stays put. */
    private growList(): void {
        const list = this.listEl;
        if (!list || this.shown >= this.roots.length) return;
        const previous = this.shown;
        this.shown = grow(this.shown, this.roots.length);
        this.sentinelEl?.remove();
        this.sentinelEl = undefined;
        for (const node of this.roots.slice(previous, this.shown)) this.renderNode(list, node);
        if (this.shown < this.roots.length) this.addSentinel(list);
    }

    /**
     * The foot of the window: a quiet mark that there is older thinking below, and a click that
     * brings it in — so the list works without a scroll wheel. It is a **door, never a number**: a
     * "23 more" here would be the backlog count the Lab exists to refuse (#469).
     */
    private addSentinel(list: HTMLElement): void {
        const more = list.createEl("button", { cls: c("lab-more"), attr: { type: "button" } });
        setIcon(more.createSpan({ cls: c("lab-more-icon") }), "more-horizontal");
        more.createSpan({ cls: c("lab-more-label"), text: t("lab_more") });
        this.registerDomEvent(more, "click", () => this.growList());
        this.sentinelEl = more;
    }

    /** Grow the window until the content fills the viewport, so nothing is stranded below the fold. */
    private fillViewport(): void {
        const el = this.container;
        if (el.clientHeight <= 0) return;
        let guard = 0;
        while (this.shown < this.roots.length && el.scrollHeight <= el.clientHeight && guard++ < 200) {
            this.growList();
        }
    }

    /** Open the calendar where the thinking is — the newest thought's month, or today if empty. */
    private toggleCalendar(): void {
        this.calendarOpen = !this.calendarOpen;
        if (this.calendarOpen) {
            const open = this.thoughts.filter((thought) => !isIncubated(thought));
            const newest = open.reduce((max, thought) => Math.max(max, thought.at), 0);
            const at = newest > 0 ? new Date(newest) : new Date();
            this.calYear = at.getFullYear();
            this.calMonth = at.getMonth();
            this.calMode = "days";
        }
        this.render();
    }

    /**
     * The calendar (#596): a way *to* a day, never a report *of* one. It shows which days (or months)
     * hold thinking as a **dot** — presence, never how many (#469) — and a click jumps the list there.
     * It reflects the current find query, so finding and the calendar compose.
     */
    private renderCalendar(host: HTMLElement): void {
        const open = this.thoughts.filter((thought) => !isIncubated(thought));
        const roots = searchThreads(threadThoughts(open), this.query());
        const times = roots.map((node) => node.thought.at);

        const panel = host.createDiv({ cls: c("lab-cal") });
        const head = panel.createDiv({ cls: c("lab-cal-head") });
        this.calNav(head, "chevron-left", t("lab_cal_prev"), () => this.stepCalendar(-1));
        const title = head.createEl("button", { cls: c("lab-cal-title"), attr: { type: "button" } });
        title.setText(this.calMode === "days" ? monthTitle(this.calYear, this.calMonth) : String(this.calYear));
        this.registerDomEvent(title, "click", () => {
            this.calMode = this.calMode === "days" ? "months" : "days";
            this.render();
        });
        this.calNav(head, "chevron-right", t("lab_cal_next"), () => this.stepCalendar(1));

        if (this.calMode === "days") this.renderMonthGrid(panel, presentDays(times));
        else this.renderYearGrid(panel, presentMonths(times));
    }

    /** A calendar arrow — a native clickable icon, so it inherits the theme's own affordance. */
    private calNav(host: HTMLElement, icon: string, label: string, onClick: () => void): void {
        const button = host.createEl("button", {
            cls: ["clickable-icon", c("lab-cal-nav")].join(" "),
            attr: { type: "button", "aria-label": label },
        });
        setIcon(button, icon);
        this.registerDomEvent(button, "click", onClick);
    }

    /** Step the calendar by one unit of whatever it is showing — a month, or (in the year view) a year. */
    private stepCalendar(delta: number): void {
        if (this.calMode === "months") {
            this.calYear += delta;
        } else {
            const month = this.calMonth + delta;
            this.calYear += Math.floor(month / 12);
            this.calMonth = ((month % 12) + 12) % 12;
        }
        this.render();
    }

    /** The month grid: weekday initials, the leading blanks, then a cell per day — dotted if it holds thinking. */
    private renderMonthGrid(panel: HTMLElement, present: Set<string>): void {
        const grid = panel.createDiv({ cls: c("lab-cal-grid") });
        for (const initial of weekdayInitials(WEEK_STARTS_ON)) {
            grid.createSpan({ cls: c("lab-cal-dow"), text: initial });
        }
        for (let blank = 0; blank < leadingBlanks(this.calYear, this.calMonth, WEEK_STARTS_ON); blank++) {
            grid.createSpan({ cls: c("lab-cal-blank") });
        }
        for (const { day, key } of monthDays(this.calYear, this.calMonth)) {
            const cell = grid.createEl("button", { cls: c("lab-cal-day"), attr: { type: "button" } });
            cell.createSpan({ cls: c("lab-cal-num"), text: String(day) });
            if (present.has(key)) {
                cell.addClass("is-present");
                cell.createSpan({ cls: c("lab-cal-dot") });
                cell.setAttribute("aria-label", t("lab_cal_day", key));
                this.registerDomEvent(cell, "click", () => this.jumpToDay(key));
            } else {
                cell.addClass("is-empty");
                cell.setAttribute("disabled", "true");
            }
        }
    }

    /** The year grid: twelve months to pick from, each dotted if it holds thinking. */
    private renderYearGrid(panel: HTMLElement, present: Set<string>): void {
        const grid = panel.createDiv({ cls: c("lab-cal-months") });
        const short = new Intl.DateTimeFormat(undefined, { month: "short" });
        for (const { month, key } of monthsOfYear(this.calYear)) {
            const cell = grid.createEl("button", { cls: c("lab-cal-month"), attr: { type: "button" } });
            cell.createSpan({ text: short.format(new Date(this.calYear, month, 1)) });
            if (present.has(key)) {
                cell.addClass("is-present");
                cell.createSpan({ cls: c("lab-cal-dot") });
                this.registerDomEvent(cell, "click", () => {
                    this.calMonth = month;
                    this.calMode = "days";
                    this.render();
                });
            } else {
                cell.addClass("is-empty");
                cell.setAttribute("disabled", "true");
            }
        }
    }

    /**
     * Jump the list to a day: grow the window just enough to include that day's newest thread, close
     * the calendar (it has done its job), and scroll the thread into view. A day with no *thread* of
     * its own is not clickable, so this always finds one.
     */
    private jumpToDay(key: string): void {
        const index = this.roots.findIndex((node) => dayKey(node.thought.at) === key);
        if (index < 0) return;
        this.shown = ensureIndexShown(this.shown, index);
        this.calendarOpen = false;
        const target = this.roots[index].thought.id;
        this.render();
        window.setTimeout(() => this.scrollTo(target), 0);
    }

    /**
     * The empty thought at the top, always ready. Typing in it is how a thought begins — and
     * typing in it, by itself, creates nothing at all.
     */
    private renderComposer(host: HTMLElement): void {
        const box = host.createDiv({ cls: c("lab-composer") });
        if (this.relation) {
            const armed = box.createDiv({ cls: c("lab-armed") });
            armed.createSpan({
                text: this.relation.as === "fork" ? t("lab_arming_fork") : t("lab_arming_challenge"),
            });
            this.ghostAction(armed, t("lab_arming_cancel"), "x", () => {
                this.relation = undefined;
                this.render();
            });
        }

        const area = box.createEl("textarea", {
            cls: [c("lab-text"), c("lab-composer-text")].join(" "),
            attr: { placeholder: this.composerPlaceholder(), rows: "2" },
        });
        area.value = this.draft;
        this.composerEl = area;
        this.registerDomEvent(area, "input", () => (this.draft = area.value));
        // A boundary, not a pause: a thought is written down when you say so, or when you leave.
        this.registerDomEvent(area, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                // Commit the **live** textarea value (not a possibly-unsynced this.draft), and catch as
                // the blur path already does — the two together are the Ctrl/Cmd+Enter fix (#596).
                void this.commit(area.value).catch((error: unknown) => log.warn("[lab] could not save", error));
            }
        });
        this.registerDomEvent(area, "blur", () => this.flush());

        this.hintEl = box.createDiv({ cls: c("lab-hint"), text: t("lab_commit_hint") });
        // Deliberately focused on render: the command's whole promise is a blinking cursor.
        window.setTimeout(() => area.focus(), 0);
    }

    /**
     * Write the draft down.
     *
     * Deliberately does **not** redraw: the card is inserted and the composer cleared in place,
     * so committing never moves the ground under you.
     */
    private async commit(explicit?: string): Promise<void> {
        // The live textarea value when the caller has it (the Ctrl/Cmd+Enter handler): a commit must
        // not depend on `this.draft` having been synced by an `input` event that may not have landed.
        const draft = explicit ?? this.draft;
        const relation = this.relation;

        // Inherited, so a thread keeps the context you arrived with — including the answers
        // you write to your own thoughts an hour later.
        const subject = relation ? this.subjectOf(relation.to) ?? this.about : this.about;
        // A collision's answer is about **both** notes, and a response inherits both, so a thread
        // that came out of one keeps the pair it came from (#567).
        const alsoSubject = relation ? this.alsoSubjectOf(relation.to) ?? this.alsoAbout : this.alsoAbout;

        // The empty-guard and the clear-**after**-write ordering live in `commitDraft` (#596/#544): a
        // write that returned nothing (`ThoughtStore.folder()` swallows a failed `getOwnPlugin()` and
        // answers `""` — #374) must never take the sentence with it.
        let made: Thought | undefined;
        const outcome = await commitDraft(
            draft,
            async (text) => {
                made = await ThoughtStore.getInstance().write(text, {
                    ...(relation ? { respondsTo: relation } : {}),
                    ...(subject ? { about: subject } : {}),
                    ...(alsoSubject ? { alsoAbout: alsoSubject } : {}),
                });
                return made !== undefined;
            },
            () => {
                this.draft = "";
                this.relation = undefined;
                if (this.composerEl) this.composerEl.value = "";
            }
        );

        if (outcome === "empty") {
            this.relation = undefined;
            return;
        }
        if (!made) {
            log.error("[lab] the thought could not be written; the lab folder answered nothing");
            this.sayCommitFailed();
            return;
        }
        this.clearCommitFailure();
        this.thoughts.push(made);
        // The gesture, written down (#492). A fork *is* a branch and a challenge *is* a challenge
        // — the Lab has always called them moves, and now it keeps them. Recorded here rather
        // than in `arm()` because arming only opens the composer: the move is the thing you did,
        // not the thing you were about to do.
        // The frame is consumed here, once (#499): one that outlived its thought would silently
        // mislabel the next one you wrote.
        const framed = this.frame;
        this.frame = undefined;
        if (framed && this.about) {
            // A move you did not make is not a move (#500). The gesture that opened this space
            // recorded nothing; *writing* is the act, and the move names both ends of it — the
            // note it was about, and the thought it produced.
            // The **path**, not the id: what a move produced is rendered on the note's timeline,
            // and a path is the one form both ends of the loop already speak (#502).
            this.rememberFramed(framed, this.about, thoughtPath(ThoughtStore.getInstance().folder(), made));
        } else if (relation) {
            this.remember(relation.as === "challenge" ? "challenge" : "fork", relation.to);
        }

        if (relation) {
            // A response has to land under what it answers, and only a redraw knows where that
            // is. Safe here because this is an explicit commit, not a timer — and the cursor is
            // put straight back where it was.
            this.render();
            this.composerEl?.focus();
            this.scrollTo(made.id);
            return;
        }
        if (!this.listEl) return;
        this.listEl.querySelector(`.${c("lab-blank")}`)?.remove();
        // A new top-level thought is a thread of one, and inserting it needs no reflow — which is
        // what keeps the common case free of a redraw.
        const thread = this.renderNode(this.listEl, { thought: made, children: [], depth: 0 });
        this.listEl.prepend(thread);
    }

    /**
     * A thought and everything written in answer to it, nested.
     *
     * The indent is capped in CSS rather than here: going eight replies deep is a real thing to
     * do, and the data should say so even when the screen cannot show it.
     */
    private renderNode(host: HTMLElement, node: ThoughtNode): HTMLElement {
        // The order the eye reads them, which is the order the keys walk.
        this.order.push(node);
        const thread = host.createDiv({ cls: c("lab-thread") });
        const card = this.renderThought(thread, node);
        if (node.children.length > 0) {
            const folded = this.collapsed.has(node.thought.id);
            // On the card, not in the footer: folding is about the thread, not about the thought.
            const toggle = card.createEl("button", {
                cls: c("lab-fold"),
                attr: { type: "button" },
            });
            setIcon(toggle, folded ? "chevron-right" : "chevron-down");
            setTooltip(toggle, folded ? t("lab_unfold") : t("lab_fold"));
            this.registerDomEvent(toggle, "mousedown", (event: MouseEvent) => {
                event.preventDefault();
                if (folded) this.collapsed.delete(node.thought.id);
                else this.collapsed.add(node.thought.id);
                this.renderList();
            });
            if (!folded) {
                const answers = thread.createDiv({ cls: c("lab-answers") });
                for (const child of node.children) this.renderNode(answers, child);
            }
        }
        // Always the whole thread: what an action removes or sets aside is this element, and
        // returning the card instead was how "throw away" left its answers hanging on screen.
        return thread;
    }

    private renderThought(list: HTMLElement, node: ThoughtNode): HTMLElement {
        const thought = node.thought;
        const box = list.createDiv({ cls: c("lab-card") });
        this.cards.set(thought.id, box);
        // Only on the thread's root: repeating it on every answer would be noise.
        if (thought.about && !thought.respondsTo) this.renderSubject(box, thought.about);
        if (this.connecting === thought.id) box.addClass(c("lab-connecting"));
        // Picked stays visibly picked — a persistent card class, not gated behind hover (#596).
        if (this.selected.has(thought.id)) box.addClass(c("lab-selected"));

        // Colour distinguishes what a thought *is* to the one above it, never who is right.
        const response = thought.respondsTo;
        if (response) {
            box.addClass(c(response.as === "challenge" ? "lab-card-challenge" : "lab-card-fork"));
            // A change of mind about a highlight (#679) says so: the pair is *then* and *now*.
            if (thought.revises) this.ribbon(box, t("evolution_timeline_changed_mind_label"), "refresh-ccw");
            else
                this.ribbon(
                    box,
                    response.as === "challenge" ? t("lab_challenges") : t("lab_forked"),
                    response.as === "challenge" ? "swords" : "git-branch"
                );
        }

        // Ink written in the Reader (#745): the handwriting itself, never a passage.
        if (isInk(thought) && thought.about) this.renderInk(box, thought, thought.about);
        // A highlight made in the Reader (#671): the passage first, then your note about it.
        else if (thought.quote?.exact && thought.about) this.renderQuote(box, thought);

        const area = box.createEl("textarea", { cls: c("lab-text"), attr: { rows: "1" } });
        area.value = thought.text;
        // Clicking into a thought is also how you tell the keys which one you mean.
        this.registerDomEvent(area, "focus", () => this.focus(thought.id));
        this.registerDomEvent(area, "input", () => this.scheduleEdit(thought, area, box));
        this.registerDomEvent(area, "blur", () => this.flush());
        // The same boundary the composer honours. Editing an existing thought had only the
        // debounce and the blur, so the hint under the composer promised a key that did nothing
        // once the cursor moved into a card.
        this.registerDomEvent(area, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                this.flush();
                area.blur();
            }
        });

        // A connection is undirected and can cross threads, so it cannot nest. It is shown
        // beside the thought as a reference you can follow, not as a count you cannot use.
        if (thought.links.length > 0) this.renderLinks(box, thought);

        // Inline #tags as chips you can click to narrow by (#596). Emergent, never a count.
        const tags = parseTags(thought.text);
        if (tags.length > 0) this.renderTags(box, tags);

        const footer = box.createDiv({ cls: c("lab-card-footer") });
        const meta = footer.createDiv({ cls: c("lab-meta") });
        meta.createSpan({ text: moment(thought.at).fromNow() });

        const actions = footer.createDiv({ cls: c("lab-actions") });
        const pick = actions.createEl("input", { type: "checkbox", cls: c("lab-pick") });
        pick.checked = this.selected.has(thought.id);
        pick.setAttribute("aria-label", t("lab_pick"));
        this.registerDomEvent(pick, "change", () => {
            if (pick.checked) this.selected.add(thought.id);
            else this.selected.delete(thought.id);
            this.refresh();
        });
        this.iconAction(actions, t("lab_fork"), "git-branch", () => this.arm("fork", thought), "fork");
        this.iconAction(actions, t("lab_challenge"), "swords", () => this.arm("challenge", thought), "challenge");
        this.iconAction(
            actions,
            this.connecting ? t("lab_connect_to") : t("lab_connect"),
            "link",
            () => void this.connect(thought),
            "connect"
        );
        // Everything below acts on the **whole thread**: an answer without the thought it
        // answers is a fragment, so a thought never leaves without what was written under it.
        const whole = flattenThread(node);
        this.iconAction(
            actions,
            this.blockLabel(t("lab_set_aside"), whole),
            "moon",
            () => void this.aside(whole, "not-now"),
            "setAside"
        );
        this.iconAction(
            actions,
            this.blockLabel(t("lab_decided_against"), whole),
            "archive",
            () => void this.aside(whole, "decided-against"),
            "decidedAgainst"
        );
        this.iconAction(
            actions,
            this.blockLabel(t("lab_discard"), whole),
            "trash-2",
            () => void this.discard(whole, box),
            "discard"
        );
        return box;
    }

    /**
     * Throw a thought away, with the undo **where the card was** (#467 follow-up).
     *
     * Not a `Notice`: this surface must never interrupt, and a strip in the space the card
     * occupied is both quieter and closer to where you are looking. The thought is kept in
     * memory, so putting it back is instant — and it went to Obsidian's trash anyway, because
     * nothing ZettelFlow removes should be unrecoverable.
     */
    private async discard(whole: readonly Thought[], card: HTMLElement): Promise<void> {
        const thread = card.closest(`.${c("lab-thread")}`) ?? card;
        thread.addClass(c("lab-leaving"));

        const store = ThoughtStore.getInstance();
        for (const thought of whole) await store.discard(thought);
        const gone = new Set(whole.map((thought) => thought.id));
        this.thoughts = this.thoughts.filter((entry) => !gone.has(entry.id));

        const strip = thread.parentElement?.createDiv({ cls: c("lab-discarded") });
        thread.remove();
        if (!strip) return;
        strip.createSpan({
            text: whole.length === 1 ? t("lab_discarded") : t("lab_discarded_thread", String(whole.length)),
        });
        this.ghostAction(strip, t("lab_discard_undo"), "undo-2", () => {
            strip.remove();
            void this.undoDiscard(whole);
        });
    }

    private async undoDiscard(whole: readonly Thought[]): Promise<void> {
        const store = ThoughtStore.getInstance();
        for (const thought of whole) await store.restore(thought);
        this.thoughts.push(...whole);
        // Unconditionally: you asked for this, and `refresh()` would refuse while the composer
        // holds the cursor — which is exactly how an undo used to work on disk and nowhere else.
        this.redrawAfterAction();
    }

    /**
     * What the tooltip says when the action will take answers with it.
     *
     * Not a badge and not a backlog — a statement about what the button you are hovering is about
     * to do. A destructive action that does not say its reach is how you lose four thoughts
     * meaning to lose one.
     */
    private blockLabel(label: string, whole: readonly Thought[]): string {
        return whole.length === 1 ? label : `${label} — ${t("lab_with_answers", String(whole.length - 1))}`;
    }

    /**
     * The note this thread is about (#473).
     *
     * Named and openable, not shown: the Lab is where you think, and turning it into a reading
     * surface would put the note back at the centre of a place that exists for the thought.
     */
    private renderSubject(box: HTMLElement, path: string): void {
        const row = box.createDiv({ cls: c("lab-subject") });
        setIcon(row.createSpan({ cls: c("lab-subject-icon") }), "file-text");
        const gone = !this.app.vault.getAbstractFileByPath(path);
        const name = displayName(path, ObsidianApi.getOwnPlugin()?.settings.library);
        const label = row.createSpan({
            cls: c("lab-subject-name"),
            text: gone ? t("lab_about_gone", name) : t("lab_about", name),
        });
        if (gone) {
            label.addClass(c("lab-subject-gone"));
            return;
        }
        setTooltip(label, t("lab_about_open"));
        this.registerDomEvent(label, "click", () => {
            void this.app.workspace.openLinkText(path, "", false);
        });
    }

    /**
     * The passage a highlight was made on (#671) — quoted, with the note it came from and a way
     * back to the very spot in the Reader. The note itself was never written to.
     */
    private renderQuote(box: HTMLElement, thought: Thought): void {
        const quote = thought.quote;
        const about = thought.about;
        if (!quote || !about) return;
        const meaning = meaningOf(thought);
        const block = box.createDiv({ cls: [c("lab-quote"), c(`lab-quote--${meaning}`)].join(" ") });
        block.createEl("blockquote", { cls: c("lab-quote-text"), text: quote.exact });
        const meta = block.createDiv({ cls: c("lab-quote-meta") });
        // What you marked it as (#720): one click shows only the highlights that mean the same.
        const chip = meta.createEl("button", {
            cls: [c("lab-meaning-chip"), c(`lab-meaning-chip--${meaning}`), ...(this.activeMeaning === meaning ? ["is-active"] : [])].join(" "),
            attr: { type: "button", "aria-label": t("lab_meaning_filter", t(LAB_MEANING_LABEL[meaning])) },
        });
        chip.createSpan({ cls: [c("lab-meaning-swatch"), c(`lab-meaning-swatch--${meaning}`)].join(" ") });
        chip.createSpan({ text: t(LAB_MEANING_LABEL[meaning]) });
        this.registerDomEvent(chip, "click", () => this.toggleMeaning(meaning));
        const name = displayName(about, ObsidianApi.getOwnPlugin()?.settings.library);
        meta.createSpan({ text: t("lab_highlight_from", quote.heading ? `${name} › ${quote.heading}` : name) });
        if (!this.app.vault.getAbstractFileByPath(about)) return;
        const open = meta.createEl("button", {
            cls: c("lab-quote-open"),
            text: t("lab_highlight_open_reader"),
            attr: { type: "button" },
        });
        this.registerDomEvent(open, "click", () => void openReader(this.app, { seed: about, highlight: thought.id }));
    }

    /** An ink note (#745 FR-13): its drawing, where it was written, and the way back to it. */
    private renderInk(box: HTMLElement, thought: Thought, about: string): void {
        const reachable = Boolean(this.app.vault.getAbstractFileByPath(about));
        renderInkCard(box, thought, {
            drawing: (ink) => ThoughtStore.getInstance().drawingOf(ink),
            name: displayName(about, ObsidianApi.getOwnPlugin()?.settings.library),
            ...(reachable ? { open: () => void openReader(this.app, { seed: about, highlight: thought.id }) } : {}),
            listen: (el, run) => this.registerDomEvent(el, "click", run),
        });
    }

    /** The thoughts this one is connected to, as chips that take you to them. */
    private renderLinks(box: HTMLElement, thought: Thought): void {
        const row = box.createDiv({ cls: c("lab-links") });
        setIcon(row.createSpan({ cls: c("lab-links-icon") }), "link");
        for (const link of thought.links) {
            const other = this.thoughts.find((entry) => entry.id === link.to);
            const chip = row.createEl("button", {
                cls: c("lab-chip"),
                text: other ? firstWords(other.text) : t("lab_link_gone"),
                attr: { type: "button" },
            });
            if (!other) {
                chip.addClass(c("lab-chip-gone"));
                continue;
            }
            setTooltip(chip, t("lab_link_go"));
            this.registerDomEvent(chip, "mousedown", (event: MouseEvent) => {
                event.preventDefault();
                this.scrollTo(other.id);
            });
        }
    }

    /** The inline #tags of a thought, as chips that add themselves to the find bar (#596). */
    private renderTags(box: HTMLElement, tags: string[]): void {
        const row = box.createDiv({ cls: c("lab-tags") });
        setIcon(row.createSpan({ cls: c("lab-tags-icon") }), "hash");
        for (const tag of tags) {
            const active = this.activeTags.has(tag);
            const chip = row.createEl("button", {
                cls: active ? [c("lab-tag-chip"), "is-active"].join(" ") : c("lab-tag-chip"),
                text: `#${tag}`,
                attr: { type: "button", "aria-label": t("lab_tag", tag) },
            });
            // `mousedown`, like the connection chips: a click that lands after a redraw never happened.
            this.registerDomEvent(chip, "mousedown", (event: MouseEvent) => {
                event.preventDefault();
                this.toggleTag(tag);
            });
        }
    }

    /** Take me to that thought, and say which one arrived. */
    private scrollTo(id: string): void {
        const target = this.cards.get(id);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.addClass(c("lab-arrived"));
        window.setTimeout(() => target.removeClass(c("lab-arrived")), 1200);
    }

    /** What an existing thought is about, so a response inherits it rather than losing it. */
    private subjectOf(id: string): string | undefined {
        return this.thoughts.find((thought) => thought.id === id)?.about;
    }

    /** The second subject a thread carries, when it came out of a collision (#567). */
    private alsoSubjectOf(id: string): string | undefined {
        return this.thoughts.find((thought) => thought.id === id)?.alsoAbout;
    }

    /**
     * Draw a pair. The seed is the clock, read **here** — the projection takes it as an argument so
     * that it stays reproducible, and this is the one place where "another one" honestly means a
     * different roll.
     */
    private drawPair(distance: CollisionDistance): Collision | null {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") return null;
        return drawCollision(index.getModel(), {
            distance,
            seed: Date.now(),
            // One side is fixed when you came from a note: *this* note, against something far away.
            ...(this.anchor ? { from: this.anchor } : {}),
            // The one filter, read where it is applied (#568).
            ruledOut: JudgementLog.getInstance().entries(),
        });
    }

    /** Two titles and what each note claims, if it claims anything. Nothing inferred. */
    private cardFor(path: string): { path: string; title: string; claim?: string } {
        const idea = KnowledgeIndex.getInstance().getModel().get(path);
        const claim = idea?.claims[0]?.text?.trim();
        return {
            path,
            title: (path.split("/").pop() ?? path).replace(/\.md$/i, ""),
            ...(claim ? { claim } : {}),
        };
    }

    /**
     * Arm the composer about the pair on screen (#567).
     *
     * The frame is `analogy` — the verb the move vocabulary already has for *what could these two
     * share* — so writing the thought records `explore · analogy` through the path #499 built, at
     * the moment the thought is written and never when the pair appears (#500).
     */
    private armPair(pair: Collision | null): void {
        if (!pair) {
            this.forgetPair();
            return;
        }
        this.about = pair.a;
        this.alsoAbout = pair.b;
        this.frame = "analogy";
    }

    private forgetPair(): void {
        this.about = undefined;
        this.alsoAbout = undefined;
        this.frame = undefined;
    }

    /**
     * What the composer invites. With a frame it names the move and the note — *"Challenge
     * «Atomicity»…"* — one line of context in the place you are about to type. Never a draft:
     * the system provides the frame, you provide the content.
     */
    private composerPlaceholder(): string {
        const verb = this.frame ? MOVE_VERBS.find((entry) => entry.verb === this.frame) : undefined;
        if (!verb || !this.about) return t("lab_new_thought");
        const name = (this.about.split("/").pop() ?? this.about).replace(/\.md$/i, "");
        return t("lab_framed_placeholder", t(verb.labelKey as Parameters<typeof t>[0]), name);
    }

    /** Arm the composer, instead of creating an empty card you would have to go back and fill. */
    private arm(kind: ResponseKind, origin: Thought): void {
        this.relation = { to: origin.id, as: kind };
        this.render();
        this.composerEl?.focus();
    }

    /** Two picks: arm on the first thought, land on the second. */
    private async connect(thought: Thought): Promise<void> {
        if (!this.connecting) {
            this.connecting = thought.id;
            this.render();
            return;
        }
        const first = this.thoughts.find((entry) => entry.id === this.connecting);
        this.connecting = undefined;
        if (!first || first.id === thought.id) {
            this.render();
            return;
        }
        const [left, right] = linkThoughts(first, thought);
        this.replace(left);
        this.replace(right);
        const store = ThoughtStore.getInstance();
        await store.save(left);
        await store.save(right);
        this.render();
    }

    private renderPicked(host: HTMLElement): void {
        const bar = host.createDiv({ cls: c("lab-picked") });
        bar.createSpan({ text: t("lab_selected", String(this.selected.size)) });
        this.ghostAction(bar, t("lab_crystallize"), "gem", () => this.openCrystallize());
        this.ghostAction(bar, t("lab_clear_selection"), "x", () => {
            this.selected.clear();
            this.render();
        });
    }

    /**
     * Propose a note, and let you rewrite it before it exists (#468).
     *
     * The thoughts are not deleted: crystallizing **sets them aside** (#590), so the bench does not
     * fill with what you already made, but the same chaos can produce a second idea next month and
     * picking them back up is one click — a door that eats the room behind it is not a door.
     */
    private openCrystallize(): void {
        const chosen = this.thoughts.filter((thought) => this.selected.has(thought.id));
        const folder = ThoughtStore.getInstance().folder();
        const paths = Object.fromEntries(chosen.map((thought) => [thought.id, thoughtPath(folder, thought)]));
        const plan = planCrystallization(chosen, paths);
        if (!plan) return;
        // One subject per crystallization: if the picked thoughts disagree about what they are
        // about, there is no honest single note to go back to.
        const subjects = new Set(chosen.map((thought) => thought.about).filter(Boolean));
        const subject = subjects.size === 1 ? [...subjects][0] : undefined;
        new CrystallizeModal(this.app, plan, (path) => void this.afterCrystallize(chosen, path), subject).open();
    }

    /**
     * The thinking became a note (#590). The thoughts it came from **leave the bench** — set aside,
     * never deleted — so it does not fill with things already made. Picking them back up is one
     * click, because the same chaos can produce a second idea next month.
     *
     * The set-aside happens **here**, in the renderer, and never in `crystallize`: the applier the
     * seam test guards stays a pure write of the note, touching no thought.
     */
    private async afterCrystallize(chosen: readonly Thought[], path?: string): Promise<void> {
        try {
            if (path && chosen.length > 0) {
                // Thinking became knowledge, here, out of these thoughts. The judgement recorded
                // inside `crystallize` is the *verdict* — a human decided this chaos was an idea;
                // this is the *operation*. One answers "was it accepted", the other "how did it get
                // here", and collapsing them would lose the genealogy.
                this.remember("crystallize", chosen[0].id, path);
                const store = ThoughtStore.getInstance();
                const at = Date.now();
                for (const thought of chosen) await store.save(setAside(thought, "crystallized", at));
            }
        } catch (error) {
            log.warn("[lab] could not set aside the crystallized thoughts", error);
        } finally {
            this.selected.clear();
            void this.readLab();
        }
    }

    /** A door, not a queue. It says the room exists; it never says how full it is. */
    private renderAsideDoor(host: HTMLElement, aside: readonly Thought[]): void {
        if (aside.length === 0) return;
        const query = this.query();
        const searching = !isEmptyQuery(query);
        const threads = searchThreads(threadThoughts(aside), query);
        // While searching, the room opens itself to the matches — still clearly "set aside" (#596).
        // With nothing matching there is nothing to reveal, so the door stays shut.
        if (searching && threads.length === 0) return;

        const door = host.createDiv({ cls: c("lab-aside-door") });
        if (searching) {
            door.createSpan({ cls: c("lab-aside-match"), text: t("lab_aside_match") });
        } else {
            this.ghostAction(
                door,
                this.showingAside ? t("lab_hide_aside") : t("lab_show_aside"),
                this.showingAside ? "chevron-up" : "chevron-down",
                () => {
                    this.showingAside = !this.showingAside;
                    this.render();
                }
            );
        }
        if (!searching && !this.showingAside) return;
        const room = host.createDiv({ cls: c("lab-list") });
        // Threaded here too: a thread set down together should be read together.
        for (const node of threads) this.renderAsideNode(room, node);
    }

    /**
     * Something you set down, and the one honest thing to say about coming back to it (#469).
     *
     * What it says is mechanical: this is what you were stuck on, and these notes have appeared
     * since. Never *this is now promising* — that is a judgement, and it is yours (§XII).
     */
    private renderAsideNode(host: HTMLElement, node: ThoughtNode): void {
        const thread = host.createDiv({ cls: c("lab-thread") });
        this.renderAside(thread, node);
        if (node.children.length === 0) return;
        const answers = thread.createDiv({ cls: c("lab-answers") });
        for (const child of node.children) this.renderAsideNode(answers, child);
    }

    private renderAside(list: HTMLElement, node: ThoughtNode): void {
        const thought = node.thought;
        const box = list.createDiv({ cls: [c("lab-card"), c("lab-aside")].join(" ") });
        const reason = thought.incubated?.reason;
        // Three reasons a thought sits on the shelf, each with its own word and icon: you set it
        // down, you decided against it, or it became a note (#590).
        const badge =
            reason === "decided-against"
                ? { key: "lab_reason_decided_against" as const, icon: "archive" }
                : reason === "crystallized"
                  ? { key: "lab_reason_crystallized" as const, icon: "gem" }
                  : { key: "lab_reason_not_now" as const, icon: "moon" };
        this.ribbon(box, t(badge.key), badge.icon);
        box.createDiv({ cls: c("lab-aside-text"), text: thought.text });

        const stuckOn = thought.incubated?.stuckOn;
        if (stuckOn) box.createDiv({ cls: c("lab-meta"), text: t("lab_stuck_on", stuckOn) });

        const since = this.appearedSinceFor(thought);
        if (since.length > 0) {
            const welcome = box.createDiv({ cls: c("lab-since") });
            welcome.createDiv({ text: t("lab_appeared_since") });
            for (const note of since) {
                const link = welcome.createDiv({ cls: c("lab-since-note"), text: note.title });
                this.registerDomEvent(link, "click", () => {
                    void this.app.workspace.openLinkText(note.path, "", false);
                });
            }
        }

        const footer = box.createDiv({ cls: c("lab-card-footer") });
        footer.createDiv({ cls: c("lab-meta"), text: moment(thought.at).fromNow() });
        const actions = footer.createDiv({ cls: c("lab-actions") });
        const whole = flattenThread(node);
        this.iconAction(actions, this.blockLabel(t("lab_pick_back_up"), whole), "undo-2", () =>
            void this.pickUp(whole)
        );
    }

    /** Notes created since you set this down that share a word with what you were stuck on. */
    private appearedSinceFor(thought: Thought) {
        const aside = thought.incubated;
        if (!aside) return [];
        const subject = `${aside.stuckOn ?? ""} ${thought.text}`;
        try {
            const notes = KnowledgeIndex.getInstance()
                .getModel()
                .all()
                .map((idea) => ({ path: idea.path, title: idea.title, created: idea.created }));
            return appearedSince(notes, aside.at, subject);
        } catch (error) {
            log.warn("[lab] could not look at what appeared since", error);
            return [];
        }
    }

    /**
     * Set a whole thread down at once.
     *
     * What you were stuck on is what you already wrote, so nothing extra is demanded at the
     * moment you stop — the moment you have least patience for a form. And the thread goes
     * together: if you set aside the idea, the counterpoint you wrote against it has nothing
     * left to argue with.
     */
    private async aside(
        whole: readonly Thought[],
        reason: "not-now" | "decided-against"
    ): Promise<void> {
        const at = Date.now();
        const store = ThoughtStore.getInstance();
        for (const thought of whole) {
            const set = setAside(thought, reason, at);
            this.replace(set);
            await store.save(set);
        }
        // One move for the whole thread: setting a thread aside is one act, however many cards
        // it moves. `decided-against` is the same verb with a different reason, and the reason
        // lives on the thought rather than in the log.
        if (whole.length > 0) this.remember(reason === "not-now" ? "setAside" : "decidedAgainst", whole[0].id);
        this.redrawAfterAction();
    }

    private async pickUp(whole: readonly Thought[]): Promise<void> {
        const store = ThoughtStore.getInstance();
        for (const thought of whole) {
            const back = pickBackUp(thought);
            this.replace(back);
            await store.save(back);
        }
        this.redrawAfterAction();
    }

    // ── saving an edit, which must never lose a sentence ──────────────────────

    private scheduleEdit(thought: Thought, area: HTMLTextAreaElement, card?: HTMLElement): void {
        this.pendingEdit = async () => {
            const next = { ...thought, text: area.value };
            this.replace(next);
            await ThoughtStore.getInstance().save(next);
            // A short pulse on the card's rule. Enough to know it landed, quiet enough to ignore.
            if (!card) return;
            card.addClass(c("lab-saved"));
            window.setTimeout(() => card.removeClass(c("lab-saved")), 900);
        };
        if (this.editTimer) window.clearTimeout(this.editTimer);
        this.editTimer = window.setTimeout(() => this.flush(), EDIT_SAVE_AFTER_MS);
    }

    /** Write whatever is waiting, now. Called on blur and on close — leaving must cost nothing. */
    /**
     * Say that the last thought did not get written — **in the composer**, under the text that is
     * still there.
     *
     * Not a `Notice`: the Lab never counts at you (#469), and a message about your sentence
     * belongs beside your sentence rather than in the corner of the screen. The draft is kept, so
     * the message is about retrying rather than about a loss.
     */
    private sayCommitFailed(): void {
        if (!this.hintEl) return;
        this.hintEl.setText(t("lab_commit_failed"));
        this.hintEl.addClass(c("lab-hint--failed"));
    }

    private clearCommitFailure(): void {
        if (!this.hintEl) return;
        this.hintEl.setText(t("lab_commit_hint"));
        this.hintEl.removeClass(c("lab-hint--failed"));
    }

    private flush(): void {
        if (this.editTimer) {
            window.clearTimeout(this.editTimer);
            this.editTimer = undefined;
        }
        const pending = this.pendingEdit;
        this.pendingEdit = undefined;
        if (pending) void pending().catch((error: unknown) => log.warn("[lab] could not save", error));
        if (this.draft.trim()) {
            void this.commit().catch((error: unknown) => log.warn("[lab] could not save", error));
        }
    }

    // ── small shared pieces ───────────────────────────────────────────────────

    private ribbon(box: HTMLElement, label: string, icon: string): void {
        const ribbon = box.createDiv({ cls: c("lab-ribbon") });
        setIcon(ribbon.createSpan({ cls: c("lab-ribbon-icon") }), icon);
        ribbon.createSpan({ text: label });
    }

    private iconAction(host: HTMLElement, label: string, icon: string, onClick: () => void, move?: LabMove): void {
        const button = host.createEl("button", { cls: c("lab-icon"), attr: { type: "button" } });
        setIcon(button, icon);
        button.setAttribute("aria-label", label);
        // An icon is quick once you know it and opaque until you do, so it says what it does —
        // and, where there is one, which key does it without the pointer.
        const entry = move ? keyFor(move) : undefined;
        setTooltip(button, entry ? `${label} (${keyLabel(entry)})` : label);
        // `mousedown`, not `click`: the composer commits on blur, and a click that lands after a
        // redraw is a click that never happened.
        this.registerDomEvent(button, "mousedown", (event: MouseEvent) => {
            event.preventDefault();
            onClick();
        });
    }

    private ghostAction(host: HTMLElement, label: string, icon: string, onClick: () => void): void {
        const button = host.createEl("button", { cls: c("lab-action"), attr: { type: "button" } });
        setIcon(button.createSpan({ cls: c("lab-action-icon") }), icon);
        button.createSpan({ text: label });
        this.registerDomEvent(button, "mousedown", (event: MouseEvent) => {
            event.preventDefault();
            onClick();
        });
    }

    private replace(thought: Thought): void {
        const at = this.thoughts.findIndex((entry) => entry.id === thought.id);
        if (at === -1) this.thoughts.push(thought);
        else this.thoughts[at] = thought;
    }
}

/** Enough of a thought to recognise it in a chip. */
function firstWords(text: string): string {
    const single = text.replace(/\s+/g, " ").trim();
    return single.length <= 32 ? single : `${single.slice(0, 31).trimEnd()}…`;
}

/** "September 2026", in the reader's own locale. */
function monthTitle(year: number, month0: number): string {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, month0, 1));
}

/** The seven weekday initials, starting on the given day (0 = Sunday), in the reader's locale. */
function weekdayInitials(weekStartsOn: number): string[] {
    const narrow = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
    // 7 Jan 2024 is a Sunday, so day 0 lands on Sunday before the rotation is applied.
    return Array.from({ length: 7 }, (_unused, index) =>
        narrow.format(new Date(2024, 0, 7 + ((weekStartsOn + index) % 7)))
    );
}

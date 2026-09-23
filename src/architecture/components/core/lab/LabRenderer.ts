import { App, moment as obsidianMoment, setIcon, setTooltip } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { linkThoughts, thoughtPath, type ResponseKind, type Thought } from "application/thinking/thought";
import {
    filterThreads,
    flattenThread,
    threadThoughts,
    type ThoughtNode,
} from "application/thinking/thread";
import { keyFor, keyLabel, LAB_KEYS, moveFor, type LabMove } from "application/thinking/labKeys";
import { LAB_MOVE_VOCABULARY, MOVE_VERBS, type MovePrimitive } from "application/thinking/move";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { planCrystallization } from "application/thinking/crystallize";
import { appearedSince, isIncubated, pickBackUp, setAside } from "application/thinking/incubation";
import { KnowledgeIndex } from "architecture/knowledge";
import { CrystallizeModal } from "./CrystallizeModal";
import { BlindPanel } from "./BlindPanel";

const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];

/** How long after you stop typing an **existing** thought is written back to its file. */
const EDIT_SAVE_AFTER_MS = 600;

/** How many thoughts before a filter is worth its space. A search box over four is furniture. */
const FILTER_APPEARS_AT = 8;

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
    /** Whether the blind question panel is open. A choice, never a mode you are put into. */
    private asking = false;
    /** Whether the short explanation of the moves is on screen. */
    private showingLegend = false;
    private blind: BlindPanel | undefined;

    /** What you are looking for. Empty is the normal state, and it shows everything. */
    private filter = "";
    /** Threads you have folded away. View state: it survives a redraw, not a restart. */
    private readonly collapsed = new Set<string>();
    /** Where you were, so returning is as cheap as arriving. */
    private scrollTop = 0;

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
        this.ghostAction(actions, t("lab_legend_open"), "help-circle", () => {
            this.showingLegend = !this.showingLegend;
            this.render();
        });
        this.ghostAction(actions, this.asking ? t("blind_close") : t("blind_open"), "eye-off", () => {
            this.asking = !this.asking;
            this.render();
        });
        if (this.showingLegend) this.renderLegend(host);

        if (this.asking) {
            const panel = host.createDiv();
            this.blind?.unload();
            this.blind = new BlindPanel(panel, (path) => {
                void this.app.workspace.openLinkText(path, "", false);
            });
            this.addChild(this.blind);
        }

        if (this.about) {
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

        this.renderComposer(host);
        if (this.selected.size > 0) this.renderPicked(host);

        const open = this.thoughts.filter((thought) => !isIncubated(thought));
        // Only once there is enough here to lose something in. A search box over four thoughts
        // is furniture.
        if (open.length >= FILTER_APPEARS_AT) this.renderFilter(host);

        this.listEl = host.createDiv({ cls: c("lab-list") });
        if (open.length === 0) {
            this.listEl.createDiv({ cls: c("lab-blank"), text: t("lab_blank") });
        }
        // Threads, not a pile sorted by clock: a counterpoint belongs under what it answers.
        this.order = [];
        const shown = filterThreads(threadThoughts(open), this.filter);
        if (shown.length === 0 && this.filter) {
            this.listEl.createDiv({ cls: c("lab-blank"), text: t("lab_filter_nothing") });
        }
        for (const node of shown) this.renderNode(this.listEl, node);
        if (this.focused && this.cards.has(this.focused)) this.focus(this.focused);

        this.renderAsideDoor(host, this.thoughts.filter(isIncubated));

        // Returning should be as cheap as arriving.
        if (this.scrollTop > 0) window.setTimeout(() => (host.scrollTop = this.scrollTop), 0);
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
        for (const move of ["next", "previous", "leave"] as const) {
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
     * A way to find the thing you are looking for, when you are looking (#477).
     *
     * Empty by default, and it narrows without ever reordering. It is a tool you pick up, not a
     * queue you are handed — which is why there is no saved filter, no suggestion and no count.
     */
    private renderFilter(host: HTMLElement): void {
        const row = host.createDiv({ cls: c("lab-filter") });
        setIcon(row.createSpan({ cls: c("lab-filter-icon") }), "search");
        const input = row.createEl("input", {
            type: "text",
            cls: c("lab-filter-input"),
            attr: { placeholder: t("lab_filter_placeholder") },
        });
        input.value = this.filter;
        this.registerDomEvent(input, "input", () => {
            this.filter = input.value;
            this.renderList();
        });
        if (this.filter) {
            this.ghostAction(row, t("lab_filter_clear"), "x", () => {
                this.filter = "";
                this.render();
            });
        }
    }

    /** Redraw only the list, so typing in the filter never touches the box you are typing in. */
    private renderList(): void {
        const list = this.listEl;
        if (!list) return;
        list.empty();
        this.cards.clear();
        this.order = [];
        const open = this.thoughts.filter((thought) => !isIncubated(thought));
        const shown = filterThreads(threadThoughts(open), this.filter);
        if (shown.length === 0) {
            list.createDiv({
                cls: c("lab-blank"),
                text: this.filter ? t("lab_filter_nothing") : t("lab_blank"),
            });
        }
        for (const node of shown) this.renderNode(list, node);
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
                void this.commit();
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
    private async commit(): Promise<void> {
        const text = this.draft.trim();
        const relation = this.relation;
        if (!text) {
            this.relation = undefined;
            return;
        }

        // Inherited, so a thread keeps the context you arrived with — including the answers
        // you write to your own thoughts an hour later.
        const subject = relation ? this.subjectOf(relation.to) ?? this.about : this.about;
        const made = await ThoughtStore.getInstance().write(text, {
            ...(relation ? { respondsTo: relation } : {}),
            ...(subject ? { about: subject } : {}),
        });

        // The box is cleared **after** the write, not before it. It used to be cleared first, so a
        // write that returned nothing — `ThoughtStore.folder()` swallows a failed `getOwnPlugin()`
        // and answers `""` (#374) — took the sentence with it: text gone, nothing saved, nothing
        // said. A thought you wrote is the one thing this surface must not lose.
        if (!made) {
            log.error("[lab] the thought could not be written; the lab folder answered nothing");
            this.sayCommitFailed();
            return;
        }
        this.clearCommitFailure();
        this.draft = "";
        this.relation = undefined;
        if (this.composerEl) this.composerEl.value = "";
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

        // Colour distinguishes what a thought *is* to the one above it, never who is right.
        const response = thought.respondsTo;
        if (response) {
            box.addClass(c(response.as === "challenge" ? "lab-card-challenge" : "lab-card-fork"));
            this.ribbon(
                box,
                response.as === "challenge" ? t("lab_challenges") : t("lab_forked"),
                response.as === "challenge" ? "swords" : "git-branch"
            );
        }

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
        const name = (path.split("/").pop() ?? path).replace(/\.md$/, "");
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
     * The thoughts are not consumed: the same chaos can produce a second idea next month, and a
     * door that eats the room behind it is not a door.
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
        new CrystallizeModal(
            this.app,
            plan,
            (path) => {
                // Thinking became knowledge, here, out of these thoughts. The judgement recorded
                // inside `crystallize` is the *verdict* — a human decided this chaos was an idea;
                // this is the *operation*. One answers "was it accepted", the other "how did it
                // get here", and collapsing them would lose the genealogy.
                if (path && chosen.length > 0) this.remember("crystallize", chosen[0].id, path);
                this.selected.clear();
                void this.readLab();
            },
            subject
        ).open();
    }

    /** A door, not a queue. It says the room exists; it never says how full it is. */
    private renderAsideDoor(host: HTMLElement, aside: readonly Thought[]): void {
        if (aside.length === 0) return;
        const door = host.createDiv({ cls: c("lab-aside-door") });
        this.ghostAction(
            door,
            this.showingAside ? t("lab_hide_aside") : t("lab_show_aside"),
            this.showingAside ? "chevron-up" : "chevron-down",
            () => {
                this.showingAside = !this.showingAside;
                this.render();
            }
        );
        if (!this.showingAside) return;
        const room = host.createDiv({ cls: c("lab-list") });
        // Threaded here too: a thread set down together should be read together.
        for (const node of threadThoughts(aside)) this.renderAsideNode(room, node);
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
        const decided = thought.incubated?.reason === "decided-against";
        this.ribbon(
            box,
            decided ? t("lab_reason_decided_against") : t("lab_reason_not_now"),
            decided ? "archive" : "moon"
        );
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

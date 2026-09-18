import { App, moment as obsidianMoment, setIcon, setTooltip } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { linkThoughts, thoughtPath, type ResponseKind, type Thought } from "application/thinking/thought";
import { threadThoughts, type ThoughtNode } from "application/thinking/thread";
import { planCrystallization } from "application/thinking/crystallize";
import { appearedSince, isIncubated, pickBackUp, setAside } from "application/thinking/incubation";
import { KnowledgeIndex } from "architecture/knowledge";
import { CrystallizeModal } from "./CrystallizeModal";
import { BlindPanel } from "./BlindPanel";

const moment = obsidianMoment as unknown as typeof MomentFn;

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

    private listEl: HTMLElement | undefined;
    /** Where each thought is on screen, so following a connection can actually go somewhere. */
    private readonly cards = new Map<string, HTMLElement>();
    private composerEl: HTMLTextAreaElement | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        void this.readLab();
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
     * Every path that wants the surface refreshed comes through here, so the rule that a redraw
     * must never steal the cursor is stated once instead of remembered in five places.
     */
    private refresh(): void {
        const active = this.container.ownerDocument.activeElement;
        if (active instanceof HTMLTextAreaElement && this.container.contains(active)) return;
        this.render();
    }

    private render(): void {
        const host = this.container;
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

        this.renderComposer(host);
        if (this.selected.size > 0) this.renderPicked(host);

        this.listEl = host.createDiv({ cls: c("lab-list") });
        const open = this.thoughts.filter((thought) => !isIncubated(thought));
        if (open.length === 0) {
            this.listEl.createDiv({ cls: c("lab-blank"), text: t("lab_blank") });
        }
        // Threads, not a pile sorted by clock: a counterpoint belongs under what it answers.
        for (const node of threadThoughts(open)) this.renderNode(this.listEl, node);

        this.renderAsideDoor(host, this.thoughts.filter(isIncubated));
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
        }
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
            attr: { placeholder: t("lab_new_thought"), rows: "2" },
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

        box.createDiv({ cls: c("lab-hint"), text: t("lab_commit_hint") });
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
        this.draft = "";
        this.relation = undefined;
        if (this.composerEl) this.composerEl.value = "";

        const made = await ThoughtStore.getInstance().write(
            text,
            relation ? { respondsTo: relation } : {}
        );
        if (!made) return;
        this.thoughts.push(made);

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
        const card = this.renderThought(this.listEl, made);
        this.listEl.prepend(card);
    }

    /**
     * A thought and everything written in answer to it, nested.
     *
     * The indent is capped in CSS rather than here: going eight replies deep is a real thing to
     * do, and the data should say so even when the screen cannot show it.
     */
    private renderNode(host: HTMLElement, node: ThoughtNode): HTMLElement {
        const thread = host.createDiv({ cls: c("lab-thread") });
        const card = this.renderThought(thread, node.thought);
        if (node.children.length === 0) return thread;

        const answers = thread.createDiv({ cls: c("lab-answers") });
        for (const child of node.children) this.renderNode(answers, child);
        return card;
    }

    private renderThought(list: HTMLElement, thought: Thought): HTMLElement {
        const box = list.createDiv({ cls: c("lab-card") });
        this.cards.set(thought.id, box);
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
        this.registerDomEvent(area, "input", () => this.scheduleEdit(thought, area, box));
        this.registerDomEvent(area, "blur", () => this.flush());

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
        this.iconAction(actions, t("lab_fork"), "git-branch", () => this.arm("fork", thought));
        this.iconAction(actions, t("lab_challenge"), "swords", () => this.arm("challenge", thought));
        this.iconAction(actions, this.connecting ? t("lab_connect_to") : t("lab_connect"), "link", () =>
            void this.connect(thought)
        );
        this.iconAction(actions, t("lab_set_aside"), "moon", () => void this.aside(thought, "not-now"));
        this.iconAction(actions, t("lab_decided_against"), "archive", () =>
            void this.aside(thought, "decided-against")
        );
        this.iconAction(actions, t("lab_discard"), "trash-2", () => void this.discard(thought, box));
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
    private async discard(thought: Thought, card: HTMLElement): Promise<void> {
        card.addClass(c("lab-leaving"));
        await ThoughtStore.getInstance().discard(thought);
        this.thoughts = this.thoughts.filter((entry) => entry.id !== thought.id);

        const strip = card.parentElement?.createDiv({ cls: c("lab-discarded") });
        card.remove();
        if (!strip) return;
        strip.createSpan({ text: t("lab_discarded") });
        this.ghostAction(strip, t("lab_discard_undo"), "undo-2", () => {
            strip.remove();
            void this.undoDiscard(thought);
        });
    }

    private async undoDiscard(thought: Thought): Promise<void> {
        await ThoughtStore.getInstance().restore(thought);
        this.thoughts.push(thought);
        this.refresh();
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
        new CrystallizeModal(this.app, plan, () => {
            this.selected.clear();
            void this.readLab();
        }).open();
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
        for (const thought of aside) this.renderAside(room, thought);
    }

    /**
     * Something you set down, and the one honest thing to say about coming back to it (#469).
     *
     * What it says is mechanical: this is what you were stuck on, and these notes have appeared
     * since. Never *this is now promising* — that is a judgement, and it is yours (§XII).
     */
    private renderAside(list: HTMLElement, thought: Thought): void {
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
        this.iconAction(actions, t("lab_pick_back_up"), "undo-2", () => void this.pickUp(thought));
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

    private async aside(thought: Thought, reason: "not-now" | "decided-against"): Promise<void> {
        // What you were stuck on is what you already wrote; nothing extra is demanded at the
        // moment you stop, which is the moment you have least patience for a form.
        const set = setAside(thought, reason, Date.now());
        this.replace(set);
        await ThoughtStore.getInstance().save(set);
        this.render();
    }

    private async pickUp(thought: Thought): Promise<void> {
        const back = pickBackUp(thought);
        this.replace(back);
        await ThoughtStore.getInstance().save(back);
        this.render();
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

    private iconAction(host: HTMLElement, label: string, icon: string, onClick: () => void): void {
        const button = host.createEl("button", { cls: c("lab-icon"), attr: { type: "button" } });
        setIcon(button, icon);
        button.setAttribute("aria-label", label);
        // An icon is quick once you know it and opaque until you do, so it says what it does.
        setTooltip(button, label);
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

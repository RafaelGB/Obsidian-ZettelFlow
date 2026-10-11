import { c } from "architecture";
import { t } from "architecture/lang";
import { flightTransform, MOTION, motionWelcome } from "./readerMotion";
import { mountIdeaPicker, type PickerChoice } from "./readerIdeaPicker";

/**
 * **The Reader's proposal card** (#748, shared with R3's #756/#759) — the inline sibling of
 * `ProposalModal` (§XII). Machine-written text beside what it is about, asking to be committed:
 * **Accept**, **Edit** (the proposal made yours; *modified*), **Reject**. Nothing is written by the
 * card; the caller writes on a verdict and records it, as `ProposalModal`'s callers do — so the card
 * is mechanical, and one card serves every proposal the Reader makes.
 *
 * It owns its motion, and the motion says where the proposal came from and where it went (§XVI):
 * it grows out of its origin (0.96 → 1 and a fade, 120 ms, from the origin's point); an accepted
 * one travels back into where it lands (its origin, unless told otherwise; `MOTION.base`); a rejected
 * one slides 8 px away and fades (120 ms). Under reduced motion it appears and goes at once.
 *
 * The decision resolves once the card has gone — so what the caller shows next appears as the card
 * lands. Esc, or `dismiss()`, resolves `null`: a dismissal is not a verdict, and records nothing.
 *
 * **In a list** (`flow`, #756): the same card stands in its host's flow — a candidate among others in
 * *Alongside* — rather than floating over the page. It is born from its origin by one flight onto its
 * place (`MOTION.base`), a rejected one slides `rejectSlide` px away, and the cards under it close the
 * gap by moving, never by changing height. Modify can be a pick (`choices`) instead of a text field.
 *
 * **Waiting** (`waiting`, #759): a card asked of your AI provider is there at once — its move, where
 * it comes from, its passage — and where the answer will be, three faint ink lines breathe (CSS,
 * opacity only). The answer lands in the same box (`land`): the ink fades out, the words fade in, and
 * nothing above them moves. Until then the card offers only *Cancel*; a failure says so in place
 * (`problem`), with its one way on.
 */

/** A sequence over every card the Reader opens: Esc dismisses the newest, whoever owns it. */
let opened = 0;
export function nextProposalSeq(): number {
    return ++opened;
}

/** Whoever holds proposal cards in the Reader: the first Esc step (`proposal`) asks each of them. */
export interface ProposalOwner {
    hasCards(): boolean;
    /** The `seq` of its newest card, or 0. */
    newestSeq(): number;
    dismissNewest(): void;
}

/** Esc on the Reader: the newest card of all its owners goes, with no verdict. Whether one did. */
export function dismissNewestOf(owners: readonly (ProposalOwner | null | undefined)[]): boolean {
    let newest: ProposalOwner | null = null;
    for (const owner of owners) {
        if (owner?.hasCards() && (!newest || owner.newestSeq() > newest.newestSeq())) newest = owner;
    }
    newest?.dismissNewest();
    return newest !== null;
}

export type ProposalBox = { left: number; top: number; width: number; height: number };

export interface ReaderProposalOptions {
    /** What the card says — the proposal as a sentence: *Reads as: "…"*, *As a move: …*. */
    intro: string;
    /** The proposed text, when it can be edited: what **Edit** opens, prefilled. */
    text?: string;
    /** Whether **Edit** is offered (it needs `text`). */
    editable?: boolean;
    /** The Edit button's label. Default *Edit*. */
    editLabel?: string;
    /** The Accept button's label. Default *Accept*. */
    acceptLabel?: string;
    /** The card's accessible name. Default *Proposed text*. */
    label?: string;
    /** Where an accepted card travels into: an element, a box, or a box asked for then. Default: its origin. */
    landing?: HTMLElement | ProposalBox | (() => ProposalBox | null);
    /** In its host's flow, as a candidate in a list (#756), rather than floating over the page. */
    flow?: boolean;
    /** How a card in a list arrives: flown from its origin (default), or simply there (it rides its panel in). */
    arrive?: "fly" | "none";
    /** A name above the line: the note a candidate is. */
    title?: string;
    /** Whether the card says its own *Nothing is written until you accept*. Default yes. */
    hint?: boolean;
    /** The label Edit takes once the text is open. Default *Save my edit*. */
    saveEditLabel?: string;
    /** How far a rejected card slides as it goes, in px. Default 8. */
    rejectSlide?: number;
    /** Edit as a pick: the choices offered, and their search. A pick is the verdict *modified*, its value the text. */
    choices?: (query: string) => readonly PickerChoice[];
    /** The pick's placeholder. */
    pickPlaceholder?: string;
    /** What Esc on the card does. Default: dismiss it. */
    onEscape?: () => void;
    /** A quiet line under the title: where the proposal comes from (*Proposed by your AI provider*). */
    byline?: string;
    /** The passage it is about, quoted. */
    passage?: string;
    /** A card on its own in a list, framed as an answer is (#759), rather than a candidate inside one. */
    framed?: boolean;
    /** Opened before its text exists (#759): the ink breathes where the answer will be, with *Cancel*. */
    waiting?: { cancelLabel: string; dismissLabel: string };
}

/** What was decided. `text` is the text to write: the proposal, or your edit of it; empty for a rejection. */
export interface ProposalDecision {
    verdict: "accepted" | "modified" | "rejected";
    text: string;
}

export interface ProposalHandle {
    /** The verdict once the card has gone — or `null` when it was dismissed without one. */
    decision: Promise<ProposalDecision | null>;
    /** The card, while it is up. */
    el: HTMLElement;
    /** Take the card away with no verdict (the view closing, another proposal replacing it). */
    dismiss(): void;
    /** When it was opened, among every card the Reader opened (`nextProposalSeq`). */
    seq: number;
    /** A waiting card's answer lands in place (#759): the ink fades out, the words fade in. */
    land(text: string): void;
    /** A quiet line under the waiting ink — *Still waiting…*, *Waiting for the one before it…* — or none. */
    note(line: string | null): void;
    /** What went wrong, in place of the answer, with its one way on (*Try again*, *Open AI settings*). */
    problem(message: string, action?: { label: string; run(): void }): void;
    /** Back to waiting: the ink again, and *Cancel*. */
    wait(): void;
}

/** The gap between the origin and the card, in px: the 4-grid's first step. */
const GAP_PX = 4;
/** How far a rejected card slides as it goes (FR-18). */
const REJECT_SLIDE_PX = 8;

function boxOf(target: HTMLElement | ProposalBox): ProposalBox {
    if ("getBoundingClientRect" in target && typeof target.getBoundingClientRect === "function") {
        const r = target.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return target as ProposalBox;
}

function windowOf(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

/** Where the cards of a list after `card` are now, to move them from there once it has gone. */
function siblingsAfter(card: HTMLElement): { el: HTMLElement; top: number }[] {
    const out: { el: HTMLElement; top: number }[] = [];
    let next = card.nextElementSibling as HTMLElement | null;
    while (next) {
        out.push({ el: next, top: next.getBoundingClientRect().top });
        next = next.nextElementSibling as HTMLElement | null;
    }
    return out;
}

/** The cards under a card that went close the gap by moving — transform only, never height (#756 FR-18). */
function closeGap(was: readonly { el: HTMLElement; top: number }[]): void {
    for (const { el, top } of was) {
        if (!el.isConnected || !motionWelcome(el)) continue;
        const dy = top - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(0px, ${Math.round(dy)}px)` }, { transform: "translate(0px, 0px)" }], { duration: MOTION.base, easing: MOTION.ease });
    }
}

/** Where a floating card sits: under its origin, inside the host; above it when there is no room below. */
function place(host: HTMLElement, card: HTMLElement, origin: HTMLElement | ProposalBox): void {
    const hostBox = host.getBoundingClientRect();
    const from = boxOf(origin);
    const size = card.getBoundingClientRect();
    const width = size.width || 0;
    const height = size.height || 0;
    // Inside the host, a step clear of its edges.
    const x = Math.max(GAP_PX, Math.min(from.left - hostBox.left, hostBox.width - width - 2 * GAP_PX));
    const below = from.top + from.height - hostBox.top + GAP_PX;
    const above = height > 0 && below + height > hostBox.height && from.top - hostBox.top - GAP_PX - height >= 0;
    // Always on screen: a card that would leave the host's visible box is kept inside it.
    let y = Math.max(GAP_PX, Math.min(above ? from.top - hostBox.top - GAP_PX - height : below, hostBox.height - height - GAP_PX));
    // Several at once (the lasso reads each note it caught): each its own card, never one over another.
    const others = (Array.from(host.children) as HTMLElement[])
        .filter((other) => other !== card && other.hasClass?.(c("reader-proposal")) && !other.hasClass(c("reader-proposal--leaving")))
        .map((other) => other.getBoundingClientRect());
    for (let moved = true, rounds = 0; moved && rounds <= others.length; rounds++) {
        moved = false;
        for (const o of others) {
            const ox = o.left - hostBox.left;
            const oy = o.top - hostBox.top;
            if (x < ox + o.width && x + width > ox && y < oy + o.height && y + height > oy) {
                y = oy + o.height + GAP_PX;
                moved = true;
            }
        }
    }
    y = Math.max(GAP_PX, Math.min(y, hostBox.height - height - GAP_PX));
    const originX = Math.round(from.left + from.width / 2 - hostBox.left - x);
    card.toggleClass(c("reader-proposal--above"), above);
    // A host that scrolls (Think's list) places its children in its content: add what is scrolled away.
    card.setCssProps({
        "--zf-prop-x": `${Math.round(x + (host.scrollLeft || 0))}px`,
        "--zf-prop-y": `${Math.round(y + (host.scrollTop || 0))}px`,
        "--zf-prop-origin": `${originX}px ${above ? "100%" : "0px"}`,
    });
}

/**
 * Open a proposal card in `host` (a positioned element), grown out of `origin` — the chip, the mark,
 * the place on the page the proposal is about. With `flow`, a card in `host`'s list, flown from `origin`.
 */
export function openProposal(host: HTMLElement, origin: HTMLElement | ProposalBox, options: ReaderProposalOptions): ProposalHandle {
    let proposed = options.waiting ? "" : (options.text ?? "");
    const flow = options.flow === true;
    // A floating card is placed in its host's own coordinates: the host is its positioned box.
    if (!flow && windowOf(host).getComputedStyle?.(host).position === "static") host.addClass(c("reader-proposal-host--placed"));
    const card = host.createDiv({
        cls: [c("reader-proposal"), ...(flow ? [c("reader-proposal--flow")] : []), ...(options.framed ? [c("reader-proposal--framed")] : [])],
        attr: { role: flow ? "group" : "dialog", "aria-label": options.label ?? t("proposal_text_label") },
    });
    if (options.title) card.createDiv({ cls: c("reader-proposal-title"), text: options.title });
    if (options.byline) card.createDiv({ cls: c("reader-proposal-byline"), text: options.byline });
    if (options.passage) card.createEl("blockquote", { cls: c("reader-proposal-passage"), text: options.passage });
    const waiting = options.waiting;
    const intro = card.createDiv({ cls: [c("reader-proposal-intro"), ...(waiting ? [c("reader-proposal-answer")] : [])], text: waiting ? "" : options.intro });
    const note = waiting ? card.createDiv({ cls: [c("reader-proposal-note"), c("reader-hidden")], attr: { "aria-live": "polite" } }) : null;
    const pending = waiting ? card.createDiv({ cls: c("reader-proposal-actions") }) : null;
    const actions = card.createDiv({ cls: c("reader-proposal-actions") });
    const accept = actions.createEl("button", { cls: "mod-cta", text: options.acceptLabel ?? t("proposal_accept"), attr: { type: "button" } });
    const canEdit = Boolean(options.editable || options.choices);
    const edit = canEdit ? actions.createEl("button", { text: options.editLabel ?? t("reader_proposal_edit"), attr: { type: "button" } }) : null;
    const reject = actions.createEl("button", { text: t("proposal_reject"), attr: { type: "button" } });
    if (options.hint !== false) card.createDiv({ cls: c("reader-proposal-hint"), text: t("proposal_recorded_hint") });
    const seq = nextProposalSeq();

    let arrival: Animation | null = null;
    if (!flow) {
        place(host, card, origin);
        // FR-15: it grows out of what it is about — never from the edge of the screen.
        if (motionWelcome(card)) {
            card.animate(
                [
                    { transform: "scale(0.96)", opacity: 0 },
                    { transform: "scale(1)", opacity: 1 },
                ],
                { duration: MOTION.fast, easing: MOTION.ease }
            );
        }
    } else if (options.arrive !== "none" && motionWelcome(card)) {
        // #756 FR-15: born from the button — one flight from where it was asked for onto its place.
        arrival = card.animate(
            [
                { transform: flightTransform(boxOf(card), boxOf(origin)), opacity: 0 },
                { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
            ],
            { duration: MOTION.base, easing: MOTION.ease }
        );
    }
    // Input during the flight jumps it to its end (#756 FR-19).
    const land = () => {
        try {
            arrival?.finish();
        } catch {
            // Already done.
        }
        arrival = null;
    };
    card.addEventListener("pointerdown", land);
    // Ready for a key, without moving anything: a focus that scrolled would move the page you read.
    if (!waiting) accept.focus?.({ preventScroll: true });

    let settle!: (decision: ProposalDecision | null) => void;
    const decision = new Promise<ProposalDecision | null>((resolve) => (settle = resolve));
    let gone = false;
    let editing: HTMLTextAreaElement | null = null;

    const leave = (outcome: ProposalDecision | null) => {
        if (gone) return;
        gone = true;
        land();
        card.addClass(c("reader-proposal--leaving"));
        const below = flow ? siblingsAfter(card) : [];
        const finish = () => {
            card.remove();
            closeGap(below);
            settle(outcome);
        };
        if (!motionWelcome(card) || outcome === null) {
            finish();
            return;
        }
        let done = false;
        const once = () => {
            if (done) return;
            done = true;
            finish();
        };
        let animation: Animation;
        let duration: number;
        if (outcome.verdict === "rejected") {
            // FR-18: it slides a little away and fades; what it was about does not move.
            duration = MOTION.fast;
            animation = card.animate(
                [
                    { transform: "translate(0px, 0px)", opacity: 1 },
                    { transform: `translate(${options.rejectSlide ?? REJECT_SLIDE_PX}px, 0px)`, opacity: 0 },
                ],
                { duration, easing: MOTION.ease, fill: "forwards" }
            );
        } else {
            // FR-17: it travels back into where it lands, and is gone as it arrives.
            const landing = typeof options.landing === "function" ? options.landing() : options.landing;
            const to = landing ? boxOf(landing) : boxOf(origin);
            duration = MOTION.base;
            animation = card.animate(
                [
                    { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
                    { opacity: 1, offset: 0.6 },
                    { transform: flightTransform(boxOf(card), to), opacity: 0 },
                ],
                { duration, easing: MOTION.ease, fill: "forwards" }
            );
        }
        animation.onfinish = once;
        windowOf(card).setTimeout(once, duration + 300);
    };

    // ── waiting (#759): the answer's place, before there is an answer ────────
    let ink: HTMLElement | null = null;
    const pendingButton = (label: string, run: () => void, cta = false): HTMLElement => {
        const button = (pending as HTMLElement).createEl("button", { text: label, attr: { type: "button" }, ...(cta ? { cls: "mod-cta" } : {}) });
        button.addEventListener("click", run);
        return button;
    };
    const wait = () => {
        if (!waiting || !pending || gone) return;
        intro.empty();
        intro.removeClass(c("reader-proposal-answer--problem"));
        // A pen about to write (FR-13): three short lines, breathing by CSS — opacity only, never a spinner.
        ink = intro.createDiv({ cls: c("reader-ink-wait"), attr: { "aria-hidden": "true" } });
        for (let i = 0; i < 3; i++) ink.createSpan();
        actions.addClass(c("reader-hidden"));
        pending.empty();
        pending.removeClass(c("reader-hidden"));
        const cancel = pendingButton(waiting.cancelLabel, () => leave(null));
        cancel.focus?.({ preventScroll: true });
    };
    /** Whatever changes the card's height moves the cards under it, never makes them jump. */
    const reflow = (change: () => void) => {
        const below = flow ? siblingsAfter(card) : [];
        change();
        closeGap(below);
    };
    const landAnswer = (text: string) => {
        if (!waiting || gone) return;
        const doc = (card as HTMLElement & { doc?: Document }).doc;
        const hadFocus = Boolean(doc?.activeElement && card.contains?.(doc.activeElement));
        reflow(() => {
            proposed = text;
            const was = ink;
            ink = null;
            note?.addClass(c("reader-hidden"));
            pending?.addClass(c("reader-hidden"));
            actions.removeClass(c("reader-hidden"));
            const words = intro.createSpan({ cls: c("reader-proposal-answer-text"), text });
            // FR-14: in the same box — the ink fades out as the words fade in, the fast beat.
            if (was && motionWelcome(card)) {
                was.addClass(c("reader-ink-wait--leaving"));
                const out = was.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" });
                const drop = () => was.remove();
                out.onfinish = drop;
                windowOf(card).setTimeout(drop, MOTION.fast + 300);
                words.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
            } else was?.remove();
        });
        // Focus follows only a hand already on the card: an answer never takes the keys from your page.
        if (hadFocus) accept.focus?.({ preventScroll: true });
    };
    const say = (line: string | null) => {
        if (!note || gone) return;
        reflow(() => {
            note.setText(line ?? "");
            note.toggleClass(c("reader-hidden"), !line);
        });
    };
    const problem = (message: string, action?: { label: string; run(): void }) => {
        if (!waiting || !pending || gone) return;
        reflow(() => {
            ink = null;
            intro.empty();
            intro.addClass(c("reader-proposal-answer--problem"));
            intro.createSpan({ cls: c("reader-proposal-answer-text"), text: message });
            note?.addClass(c("reader-hidden"));
            actions.addClass(c("reader-hidden"));
            pending.empty();
            pending.removeClass(c("reader-hidden"));
            const first = action ? pendingButton(action.label, () => action.run(), true) : null;
            const dismiss = pendingButton(waiting.dismissLabel, () => leave(null));
            (first ?? dismiss).focus?.({ preventScroll: true });
        });
    };
    if (waiting) wait();

    const accepted = () => {
        if (!editing) return leave({ verdict: "accepted", text: proposed });
        const text = editing.value.trim();
        if (!text) return;
        leave({ verdict: text === proposed.trim() ? "accepted" : "modified", text });
    };

    accept.addEventListener("click", accepted);
    reject.addEventListener("click", () => leave({ verdict: "rejected", text: "" }));
    edit?.addEventListener("click", () => {
        const choices = options.choices;
        if (choices) {
            // Modify as a pick (#756 FR-7): the choices where the actions were; a pick is your answer.
            if (card.querySelector(`.${c("reader-idea-picker")}`)) return;
            actions.addClass(c("reader-hidden"));
            const picker = mountIdeaPicker(card, {
                choices,
                placeholder: options.pickPlaceholder ?? options.editLabel ?? t("reader_proposal_edit"),
                label: options.label ?? t("proposal_text_label"),
                onPick: (choice) => leave({ verdict: choice.value === proposed ? "accepted" : "modified", text: choice.value }),
                onCancel: () => {
                    picker.el.remove();
                    actions.removeClass(c("reader-hidden"));
                    edit.focus?.({ preventScroll: true });
                },
            });
            return;
        }
        if (editing) return accepted();
        // Edit: the proposal, yours to change — the same card, a field where its words were.
        editing = card.createEl("textarea", { cls: c("reader-proposal-text"), attr: { rows: "3", "aria-label": options.label ?? t("proposal_text_label") } });
        card.insertBefore(editing, actions);
        editing.value = proposed;
        intro.addClass(c("reader-proposal-intro--editing"));
        accept.remove();
        edit.setText(options.saveEditLabel ?? t("proposal_save_edit"));
        edit.addClass("mod-cta");
        const field = editing;
        field.addEventListener("input", () => (edit.disabled = field.value.trim().length === 0));
        field.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                accepted();
            }
        });
        field.focus?.({ preventScroll: true });
    });
    card.addEventListener("keydown", (event: KeyboardEvent) => {
        land();
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (options.onEscape) options.onEscape();
        else leave(null);
    });

    return { decision, el: card, dismiss: () => leave(null), seq, land: landAnswer, note: say, problem, wait };
}

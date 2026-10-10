import { c } from "architecture";
import { t } from "architecture/lang";
import { flightTransform, MOTION, motionWelcome } from "./readerMotion";

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
 */

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

/**
 * Open a proposal card in `host` (a positioned element), grown out of `origin` — the chip, the mark,
 * the place on the page the proposal is about.
 */
export function openProposal(host: HTMLElement, origin: HTMLElement | ProposalBox, options: ReaderProposalOptions): ProposalHandle {
    const proposed = options.text ?? "";
    // The card is placed in its host's own coordinates: the host is its positioned box.
    if (windowOf(host).getComputedStyle?.(host).position === "static") host.addClass(c("reader-proposal-host--placed"));
    const card = host.createDiv({
        cls: c("reader-proposal"),
        attr: { role: "dialog", "aria-label": options.label ?? t("proposal_text_label") },
    });
    const intro = card.createDiv({ cls: c("reader-proposal-intro"), text: options.intro });
    const actions = card.createDiv({ cls: c("reader-proposal-actions") });
    const accept = actions.createEl("button", { cls: "mod-cta", text: options.acceptLabel ?? t("proposal_accept"), attr: { type: "button" } });
    const edit = options.editable ? actions.createEl("button", { text: options.editLabel ?? t("reader_proposal_edit"), attr: { type: "button" } }) : null;
    const reject = actions.createEl("button", { text: t("proposal_reject"), attr: { type: "button" } });
    card.createDiv({ cls: c("reader-proposal-hint"), text: t("proposal_recorded_hint") });

    // Where it sits: under its origin, inside the host; above it when there is no room below.
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
    // Ready for a key, without moving anything: a focus that scrolled would move the page you read.
    accept.focus?.({ preventScroll: true });

    let settle!: (decision: ProposalDecision | null) => void;
    const decision = new Promise<ProposalDecision | null>((resolve) => (settle = resolve));
    let gone = false;
    let editing: HTMLTextAreaElement | null = null;

    const leave = (outcome: ProposalDecision | null) => {
        if (gone) return;
        gone = true;
        card.addClass(c("reader-proposal--leaving"));
        const finish = () => {
            card.remove();
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
                    { transform: `translate(${REJECT_SLIDE_PX}px, 0px)`, opacity: 0 },
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

    const accepted = () => {
        if (!editing) return leave({ verdict: "accepted", text: proposed });
        const text = editing.value.trim();
        if (!text) return;
        leave({ verdict: text === proposed.trim() ? "accepted" : "modified", text });
    };

    accept.addEventListener("click", accepted);
    reject.addEventListener("click", () => leave({ verdict: "rejected", text: "" }));
    edit?.addEventListener("click", () => {
        if (editing) return accepted();
        // Edit: the proposal, yours to change — the same card, a field where its words were.
        editing = card.createEl("textarea", { cls: c("reader-proposal-text"), attr: { rows: "3", "aria-label": options.label ?? t("proposal_text_label") } });
        card.insertBefore(editing, actions);
        editing.value = proposed;
        intro.addClass(c("reader-proposal-intro--editing"));
        accept.remove();
        edit.setText(t("proposal_save_edit"));
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
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        leave(null);
    });

    return { decision, el: card, dismiss: () => leave(null) };
}

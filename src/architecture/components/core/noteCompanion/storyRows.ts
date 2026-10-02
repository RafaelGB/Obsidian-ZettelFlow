import { setIcon, type App, type Component } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { STATE_LABEL_KEY } from "architecture/knowledge";
import {
    DECISION_KINDS,
    type HorizonEvent,
    type Judgement,
    type PromotionEvent,
    type ReturnEvent,
    type Snapshot,
    type ThoughtRef,
    type TimelineEvent,
    type TimelineEventKind,
} from "architecture/knowledge/state";
import { MOVE_VERBS, type Move } from "application/thinking/move";
import { makeActivatable, hoverPreview } from "architecture/components/core/a11y";
import { absoluteDay, relativeLabel } from "./storyFormat";

type LocaleKey = Parameters<typeof t>[0];

/** One icon per kind, and no two kinds share one (#642 FR-3). Lucide ids. */
export const STORY_ICON: Record<TimelineEventKind, string> = {
    snapshot: "camera",
    judgement: "gavel",
    move: "footprints",
    thought: "lightbulb",
    return: "repeat",
    promotion: "arrow-up-circle",
    horizon: "flag",
};

/** What each verdict is called on the line. A literal map, so the locale guardrail sees it. */
const VERDICT_KEY: Record<string, LocaleKey> = {
    confirmed: "evolution_timeline_return_confirmed",
    modified: "evolution_timeline_return_modified",
    rejected: "evolution_timeline_return_withdrawn",
};

/** What a row needs from its block: where to hang previews, how to listen, and what "now" is. */
export interface RowContext {
    app: App;
    owner: Component;
    now: number;
    on: (el: HTMLElement, type: "click", handler: () => void) => void;
    /** Take a move back — the block reads the story again afterwards. */
    forget: (move: Move) => void;
}

/** Draw one past event as a row of the rail. */
export function renderEvent(list: HTMLElement, event: TimelineEvent, ctx: RowContext): void {
    const row = list.createEl("li", {
        cls: [
            c("note-story-ev"),
            c(`note-story-ev--${event.kind}`),
            ...(DECISION_KINDS.has(event.kind) ? [c("note-story-ev--decision")] : []),
        ].join(" "),
    });
    const icon = row.createSpan({ cls: c("note-story-icon"), attr: { "aria-hidden": "true" } });
    setIcon(icon, STORY_ICON[event.kind]);
    const body = row.createDiv({ cls: c("note-story-body") });

    if (event.kind === "snapshot" && event.snapshot) renderSnapshot(body, event.snapshot, ctx);
    else if (event.kind === "judgement" && event.judgement) renderJudgement(body, event.judgement, ctx);
    else if (event.kind === "move" && event.move) renderMove(body, event.move, ctx);
    else if (event.kind === "thought" && event.thought) renderThought(body, event.thought, ctx);
    else if (event.kind === "return" && event.return) renderReturn(body, event.return, ctx);
    else if (event.kind === "promotion" && event.promotion) renderPromotion(body, event.promotion, ctx);
    else if (event.kind === "horizon" && event.horizon) renderHorizon(body, event.horizon, ctx);
}

/** The relative date, with the day itself on hover and for assistive technology (FR-4). */
function when(line: HTMLElement, at: number, ctx: RowContext): void {
    const day = absoluteDay(at);
    line.createEl("time", {
        cls: c("note-story-when"),
        text: relativeLabel(at, ctx.now),
        attr: { datetime: new Date(at).toISOString(), title: day, "aria-label": day },
    });
}

function headLine(body: HTMLElement, labelKey: LocaleKey, at: number, ctx: RowContext): HTMLElement {
    const line = body.createDiv({ cls: c("note-story-line") });
    line.createSpan({ cls: c("note-story-label"), text: t(labelKey) });
    const text = line.createSpan({ cls: c("note-story-text") });
    when(line, at, ctx);
    return text;
}

/**
 * A snapshot: where the note stood and how many claims it held (FR-9). The claim texts are behind
 * the row's own disclosure — never in its summary, so a folded rail is not a wall of sentences.
 */
function renderSnapshot(body: HTMLElement, snapshot: Snapshot, ctx: RowContext): void {
    const key = (STATE_LABEL_KEY as Record<string, string>)[snapshot.state];
    const state = key ? t(key as LocaleKey) : snapshot.state;
    const claims = tCount(snapshot.claims.length, "note_companion_claims", String(snapshot.claims.length));
    if (snapshot.claims.length === 0) {
        headLine(body, "evolution_timeline_state_label", snapshot.at, ctx).setText(`${state} · ${claims}`);
        return;
    }
    const details = body.createEl("details", { cls: c("note-story-snapshot") });
    const summary = details.createEl("summary", { cls: c("note-story-line") });
    summary.createSpan({ cls: c("note-story-label"), text: t("evolution_timeline_state_label") });
    summary.createSpan({ cls: c("note-story-text"), text: `${state} · ${claims}` });
    when(summary, snapshot.at, ctx);
    const list = details.createDiv({ cls: c("note-story-claims") });
    for (const claim of snapshot.claims) list.createDiv({ cls: c("note-story-claim"), text: claim });
}

/** A cognitive milestone (#362, D2): the verdict, its confidence, and the rationale. */
function renderJudgement(body: HTMLElement, judgement: Judgement, ctx: RowContext): void {
    const text = headLine(body, "evolution_timeline_judgement_label", judgement.at, ctx);
    text.createSpan({ text: t(`judgement_verdict_${judgement.verdict}` as LocaleKey) });
    if (judgement.confidence) {
        text.createSpan({
            cls: c("note-story-quiet"),
            text: ` · ${t(`confidence_${judgement.confidence}` as LocaleKey)}`,
        });
    }
    if (judgement.note) body.createDiv({ cls: c("note-story-note"), text: judgement.note, attr: { title: judgement.note } });
}

/**
 * One move, as a sentence rather than a row (#494).
 *
 * What it says is a **fact restated**: you did this, to this, then. It never characterises
 * the sequence — no density, no depth, no "well developed". A run of moves invites a
 * conclusion and drawing one is a verdict, which §XII puts behind a human decision that has
 * not been asked for here.
 */
function renderMove(body: HTMLElement, move: Move, ctx: RowContext): void {
    const text = headLine(body, "evolution_timeline_move_label", move.at, ctx);
    const verb = MOVE_VERBS.find((entry) => entry.verb === move.verb);
    text.createSpan({ text: verb ? t(verb.labelKey as LocaleKey) : move.verb });
    if (move.produced) renderProduced(text, move.produced, ctx);
    // You can take a move back from where you can see it is wrong. It touches the log and
    // nothing else — never the note it referred to.
    const forget = body.createEl("button", {
        cls: c("note-story-forget"),
        text: t("evolution_timeline_move_forget"),
        attr: { type: "button" },
    });
    ctx.on(forget, "click", () => ctx.forget(move));
}

/**
 * A thought you wrote about this note (#540).
 *
 * It states what happened and nothing else: no verb, because you did not pick one — you thought
 * about the note and something came out of your head. The row carries no text from the thought,
 * only a way to open it.
 */
function renderThought(body: HTMLElement, thought: ThoughtRef, ctx: RowContext): void {
    renderProduced(headLine(body, "evolution_timeline_thought_label", thought.at, ctx), thought.path, ctx);
}

/**
 * A claim you were asked about again (#564, epic #558), told as one unit: what it said before,
 * what it says now (FR-10). It states and never assesses — no word about improvement, depth or
 * progress, in either language, and a locale scan holds the line. A *Before* that was not kept is
 * absent, never invented; a withdrawal has no *Now*.
 */
function renderReturn(body: HTMLElement, entry: ReturnEvent, ctx: RowContext): void {
    const text = headLine(body, "evolution_timeline_return_label", entry.judgement.at, ctx);
    text.createSpan({ text: t(VERDICT_KEY[entry.verdict] ?? "evolution_timeline_return_confirmed") });
    if (entry.thought) renderProduced(text, entry.thought.path, ctx);

    if (entry.said === undefined && entry.says === undefined) return;
    const diff = body.createDiv({ cls: c("note-story-diff") });
    if (entry.said !== undefined) {
        const said = diff.createDiv({ cls: [c("note-story-diff-line"), c("note-story-diff-before")].join(" ") });
        said.createSpan({ cls: c("note-story-label"), text: t("evolution_timeline_return_then") });
        said.createSpan({ cls: c("note-story-claim"), text: entry.said });
    }
    if (entry.says !== undefined) {
        const says = diff.createDiv({ cls: c("note-story-diff-line") });
        says.createSpan({ cls: c("note-story-label"), text: t("evolution_timeline_return_now") });
        says.createSpan({ cls: c("note-story-claim"), text: entry.says });
    }
}

/**
 * A note you promoted (#581). The snapshot says the note is now `literature`; this says **you
 * decided that**. It states the act and nothing else — no word about maturity.
 */
function renderPromotion(body: HTMLElement, entry: PromotionEvent, ctx: RowContext): void {
    const key = (STATE_LABEL_KEY as Record<string, string>)[entry.to];
    headLine(body, "evolution_timeline_promotion_label", entry.judgement.at, ctx).setText(
        t("evolution_timeline_promotion", key ? t(key as LocaleKey) : entry.to)
    );
}

/**
 * A day you expected to know by, once it has passed (#572). While it is ahead the block pins it
 * above the rail instead; either way it says the same sentence at every distance — a date in the
 * future invites a countdown, and a countdown is how a thinking tool becomes a task manager.
 */
function renderHorizon(body: HTMLElement, entry: HorizonEvent, ctx: RowContext): void {
    headLine(body, "evolution_timeline_horizon_label", entry.at, ctx).setText(t("evolution_timeline_horizon"));
    body.createDiv({ cls: c("note-story-claim"), text: entry.expectation });
}

/**
 * What the move left you holding (#502). A thought that has since been discarded is **named and
 * not linked** — the Lab is a place things are deliberately thrown away, and a dead link (or a dead
 * preview) is worse than a plain fact.
 */
function renderProduced(line: HTMLElement, path: string, ctx: RowContext): void {
    const app = ctx.app;
    const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
    const exists = app.vault.getAbstractFileByPath(path) !== null;
    const span = line.createSpan({
        cls: c(exists ? "note-story-produced" : "note-story-produced-gone"),
        text: ` ${t("evolution_timeline_move_produced", name)}`,
    });
    if (exists) {
        makeActivatable(span, () => void app.workspace.openLinkText(path, "", false));
        hoverPreview(app, span, path, ctx.owner);
    }
}

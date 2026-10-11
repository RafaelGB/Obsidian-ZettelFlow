import type { App } from "obsidian";
import { log } from "architecture";
import { t } from "architecture/lang";
import { aiMaxInputChars, type AiGateState, type AiSettings } from "architecture/ai/aiGate";
import type { AiProvider } from "architecture/ai/AiProvider";
import { AiService } from "architecture/ai/AiService";
import type { Judgement } from "architecture/knowledge/state";
import { JudgementLog, type JudgementEntry } from "architecture/plugin/judgement/JudgementLog";
import { MoveLog, type MoveEntry } from "architecture/plugin/thinking/MoveLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { ReaderAiQueue, type ReaderAiFailure, type ReaderAiJob } from "architecture/plugin/thinking/readerAiQueue";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { openZettelFlowSettings } from "architecture/components/core/surface/openSettings";
import {
    READER_AI_MOVES,
    buildReaderMovePrompt,
    cleanAnswer,
    parseClaimAnswer,
    primitiveOf,
    readerAiMove,
    type ClaimKind,
    type ReaderAiMove,
    type ReaderAiMoveId,
} from "application/thinking/readerMovePrompts";
import { thoughtPath, type Response, type Thought, type ThoughtLocator, type ThoughtMadeBy, type ThoughtQuote } from "application/thinking/thought";
import { openProposal, type ProposalBox, type ProposalDecision, type ProposalHandle, type ProposalOwner } from "./readerProposal";
import { chapterKeyOf, makeRoom, type VaultMovePassage } from "./readerVaultMoves";
import type { FromReadingEntry } from "./readerAlongside";
import type { ThinkMove } from "./readerHighlights";

/**
 * **Thinking moves by your AI provider** (#759, epic #741): *Why?*, *Challenge*, *Question*, *What's
 * the claim*, *Reflect* and *Explain* — one question asked of one passage, by **your** provider, and
 * only when you click (FR-2). After *Contradict* and *Connect* in the *Think* row, and only while AI
 * is turned on (FR-3): not set up, a click says so and sends nothing.
 *
 * What is sent is the move's task, the selected words, their paragraph and the one before, and the
 * book's and chapter's titles — nothing from your vault (FR-4, `readerMovePrompts.ts`). The answer
 * is a **proposal** (§XII): the Reader's card, at once, in *Alongside*, the ink breathing where the
 * answer will be. Nothing is written until you decide, and every verdict is recorded:
 *
 * | Verdict | Written | Recorded |
 * |---|---|---|
 * | Accept, or Modify then *Keep my version* | one thought about the book, quoting the passage — `madeBy: { move, ai: true }`, threaded under a highlight (*Challenge* as a challenge, the rest as forks) | the verdict, origin `ai`, `reader-ai:<move>`, no text; the move under its verb of #489 |
 * | Reject | nothing | the verdict `rejected` |
 * | Dismiss, *Cancel*, the Reader closing | nothing | nothing |
 *
 * Requests go through the Reader's own queue (`readerAiQueue.ts`): one per click, two at once, and
 * nothing ever retries by itself.
 */

/** After this long, a quiet line says the provider is still being waited for (FR-13). */
export const STILL_WAITING_MS = 8_000;

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key. */
export const AI_MOVE_KEY: Record<ReaderAiMoveId, LocaleKey> = {
    why: "reader_move_why",
    challenge: "reader_move_challenge",
    question: "reader_move_question",
    claim: "reader_move_claim",
    reflect: "reader_move_reflect",
    explain: "reader_move_explain",
};
const CLAIM_KIND_KEY: Record<ClaimKind, LocaleKey> = {
    causal: "reader_claim_kind_causal",
    general: "reader_claim_kind_general",
    normative: "reader_claim_kind_normative",
    descriptive: "reader_claim_kind_descriptive",
    predictive: "reader_claim_kind_predictive",
};

/** A passage an AI move works on: the passage of #756, with its paragraph and the one before. */
export interface AiMovePassage extends VaultMovePassage {
    paragraph: string;
    previous: string;
}

/** What the Reader lends the moves. */
export interface AiMovesView {
    app: App;
    /** Alongside open, and where proposals go — `opened` when it was closed and opens now. */
    openAlongside(): { host: HTMLElement; opened: boolean } | null;
    fromReadingBox(): ProposalBox | null;
    addFromReading(entry: FromReadingEntry): void;
    /** *Claim* on an accepted *What's the claim* (#762 FR-1): the claim sheet, its sentence prefilled. */
    claim?(thought: Thought, from?: ProposalBox): void;
    /** A dot on Alongside's button: an answer landed while it was closed (FR-14). */
    dot(on: boolean): void;
    /** Your Obsidian language, as a tag (`es`): the answer is asked in it (FR-5). */
    language(): string;
}

/** The AI layer, as the moves use it — `AiService` unless a test gives another. */
export interface ReaderAi {
    gate(): AiGateState;
    config(): AiSettings;
    getProvider(): AiProvider;
}

interface StoreLike {
    folder(): string;
    write(text: string, options: { about?: string; quote?: ThoughtQuote; locator?: ThoughtLocator; respondsTo?: Response; madeBy?: ThoughtMadeBy }): Promise<Thought | undefined>;
}

/** Seams for tests: the AI layer, the store, the record, the move log, Settings, the queue. */
export interface AiMovesDeps {
    ai?: ReaderAi;
    store?: StoreLike;
    judgements?: { record(entry: JudgementEntry): Judgement | null };
    moves?: { record(entry: MoveEntry): unknown };
    openSettings?: (app: App) => void;
    queue?: ReaderAiQueue;
}

/** The gate, read without ever throwing: a Reader with no plugin settings has no AI. */
export function readGate(ai: () => ReaderAi): AiGateState {
    try {
        return ai().gate();
    } catch {
        return "disabled";
    }
}

/**
 * The six for the *Think* row, by the gate as it is now (FR-3): none while AI is off; offered while
 * it is on, set up or not — a click on one not set up says so.
 */
export function aiThinkMoves(gate: AiGateState, run: (move: ReaderAiMoveId) => ThinkMove["run"]): ThinkMove[] {
    if (gate === "disabled") return [];
    return READER_AI_MOVES.map((move) => ({ id: move.id, label: AI_MOVE_KEY[move.id], run: run(move.id) }));
}

/** What a move's answer reads as on the card: cleaned, bounded, and for a claim, its kind. */
export function answerText(move: ReaderAiMove, raw: string): string {
    if (move.id !== "claim") return cleanAnswer(raw, move);
    const { claim, kind } = parseClaimAnswer(raw);
    if (!claim) return "";
    return kind ? `${claim}\n${t("reader_ai_claim_kind", t(CLAIM_KIND_KEY[kind]))}` : claim;
}

function failureLine(failure: ReaderAiFailure): string {
    if (failure.kind === "timeout") return t("reader_ai_no_answer");
    if (failure.kind === "status") return t("reader_ai_status", String(failure.status));
    return t("reader_ai_failed");
}

function snippet(text: string, max = 160): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface Card {
    handle: ProposalHandle;
    move: ReaderAiMove;
    passage: AiMovePassage;
    key: string;
    job: ReaderAiJob | null;
    timer: number | undefined;
    /** In Alongside now; out of it while the panel is closed (the card waits, kept). */
    mounted: boolean;
    gone: boolean;
}

export class ReaderAiMoves implements ProposalOwner {
    private readonly cards = new Set<Card>();
    private readonly ai: () => ReaderAi;
    private readonly store: StoreLike;
    private readonly judgements: NonNullable<AiMovesDeps["judgements"]>;
    private readonly moves: NonNullable<AiMovesDeps["moves"]>;
    private readonly openSettings: NonNullable<AiMovesDeps["openSettings"]>;
    /** Every request the Reader sends to your provider waits here — #766's *Translate* too. */
    readonly queue: ReaderAiQueue;
    private disposed = false;

    constructor(
        private readonly view: AiMovesView,
        deps: AiMovesDeps = {}
    ) {
        this.ai = () => deps.ai ?? AiService.getInstance();
        this.store = deps.store ?? ThoughtStore.getInstance();
        this.judgements = deps.judgements ?? JudgementLog.getInstance();
        this.moves = deps.moves ?? MoveLog.getInstance();
        this.openSettings = deps.openSettings ?? ((app) => openZettelFlowSettings(app, "ai"));
        this.queue = deps.queue ?? new ReaderAiQueue(() => this.ai().getProvider());
    }

    /** The six, as the *Think* row offers them now (read each time the popover opens). */
    thinkMoves(run: (move: ReaderAiMoveId) => ThinkMove["run"]): ThinkMove[] {
        return aiThinkMoves(readGate(this.ai), run);
    }

    // ── the first Esc step (#748, #756): the newest card, whoever owns it ───

    hasCards(): boolean {
        return [...this.cards].some((card) => card.mounted);
    }

    newestSeq(): number {
        return [...this.cards].filter((card) => card.mounted).reduce((max, card) => Math.max(max, card.handle.seq), 0);
    }

    dismissNewest(): void {
        const newest = [...this.cards].filter((card) => card.mounted).sort((a, b) => b.handle.seq - a.handle.seq)[0];
        newest?.handle.dismiss();
    }

    /**
     * Alongside closed: the cards are kept — a request is your click, and its answer is still coming —
     * and leave the panel with it. They come back when it opens (`attach`).
     */
    detach(): void {
        for (const card of this.cards) {
            card.mounted = false;
            card.handle.el.remove();
        }
    }

    /** Alongside open again: the cards back at the top of it, oldest first, and the dot goes (FR-14). */
    attach(host: HTMLElement | null): void {
        this.view.dot(false);
        if (!host) return;
        for (const card of [...this.cards].sort((a, b) => a.handle.seq - b.handle.seq)) {
            if (card.mounted) continue;
            host.appendChild(card.handle.el);
            card.mounted = true;
        }
    }

    /** The Reader closed: every waiting answer is discarded, and nothing is recorded (AC-5). */
    dispose(): void {
        this.disposed = true;
        this.queue.dispose();
        for (const card of [...this.cards]) card.handle.dismiss();
    }

    // ── a move ───────────────────────────────────────────────────────────────

    /** Make `id` on `passage`, asked for from `from` (the button's box): the card is born there. */
    run(id: ReaderAiMoveId, passage: AiMovePassage, from: ProposalBox): void {
        if (this.disposed) return;
        const gate = readGate(this.ai);
        if (gate === "disabled") return;
        const move = readerAiMove(id);
        const key = `${id}:${passage.quote.exact}:${chapterKeyOf(passage.book, passage.locator)}`;
        // The same move on the same passage while its card stands: nothing more is sent (FR-9).
        if ([...this.cards].some((card) => card.key === key)) return;
        const alongside = this.view.openAlongside();
        if (!alongside) return;
        let handle: ProposalHandle | null = null;
        // FR-12: the card is there at once — its move, where it comes from, its passage — flown from the
        // button, and what was in the panel makes room by moving (#756).
        makeRoom(alongside.host, !alongside.opened, () => {
            handle = openProposal(alongside.host, from, {
                flow: true,
                framed: true,
                arrive: alongside.opened ? "none" : "fly",
                title: t(AI_MOVE_KEY[id]),
                byline: t("reader_proposal_from_ai"),
                passage: snippet(passage.quote.exact),
                intro: "",
                editable: true,
                editLabel: t("reader_proposal_modify"),
                saveEditLabel: t("reader_proposal_keep"),
                label: t(AI_MOVE_KEY[id]),
                waiting: { cancelLabel: t("reader_ai_cancel"), dismissLabel: t("reader_proposal_dismiss") },
                landing: () => {
                    const box = this.view.fromReadingBox();
                    return box && box.width > 0 && box.height > 0 ? box : null;
                },
            });
        });
        const made = handle as ProposalHandle | null;
        if (!made) return;
        const card: Card = { handle: made, move, passage, key, job: null, timer: undefined, mounted: true, gone: false };
        this.cards.add(card);
        void made.decision.then((decision) => this.decided(card, decision));
        // FR-3: on, not set up — the card says so and points to Settings; nothing is sent.
        if (gate !== "ready") {
            made.problem(t("reader_ai_setup"), { label: t("reader_ai_open_settings"), run: () => this.openSettings(this.view.app) });
            return;
        }
        // A thought needs a thinking space: no request is spent on an answer that could not be kept.
        if (!this.store.folder()) {
            made.problem(t("reader_hl_no_lab"));
            return;
        }
        void this.send(card);
    }

    /** One request for the card (FR-9): queued behind two, *Still waiting…* after 8 s, never retried. */
    private async send(card: Card): Promise<void> {
        const { handle, move, passage } = card;
        let prompt: string;
        try {
            const ai = this.ai();
            if (ai.gate() !== "ready") {
                handle.problem(t("reader_ai_setup"), { label: t("reader_ai_open_settings"), run: () => this.openSettings(this.view.app) });
                return;
            }
            prompt = buildReaderMovePrompt(
                move,
                { selected: passage.quote.exact, paragraph: passage.paragraph, previous: passage.previous, bookTitle: passage.bookTitle, chapterTitle: passage.locator.label },
                { maxChars: aiMaxInputChars(ai.config()), language: this.view.language() }
            );
        } catch (error) {
            log.warn(`[reader] an AI move could not be asked: ${error instanceof Error ? error.name : "error"}`);
            handle.problem(t("reader_ai_failed"));
            return;
        }
        const job = this.queue.ask(card.key, prompt);
        if (!job) return;
        card.job = job;
        if (job.queued) handle.note(t("reader_ai_queued"));
        const win = handle.el.win ?? window;
        void job.started.then(() => {
            if (card.gone || card.job !== job) return;
            if (job.queued) handle.note(null);
            card.timer = win.setTimeout(() => {
                if (!card.gone && card.job === job) handle.note(t("reader_ai_still_waiting"));
            }, STILL_WAITING_MS);
        });
        const outcome = await job.result;
        win.clearTimeout(card.timer);
        card.timer = undefined;
        // Cancelled, dismissed, or the Reader closed: a late answer shows nothing (AC-5).
        if (card.gone || this.disposed || card.job !== job || outcome.kind === "discarded") return;
        card.job = null;
        // *Try again* is a new click: a new request, never one sent by itself (FR-9).
        const again = {
            label: t("reader_ai_try_again"),
            run: () => {
                handle.wait();
                void this.send(card);
            },
        };
        if (outcome.kind === "failed") {
            handle.problem(failureLine(outcome.failure), again);
            return;
        }
        const text = answerText(move, outcome.text);
        if (!text) {
            log.warn("[reader] an AI move failed: empty");
            handle.problem(t("reader_ai_failed"), again);
            return;
        }
        handle.land(text);
        // Landed with Alongside closed: a dot on its button, never a Notice (FR-14).
        if (!card.mounted) this.view.dot(true);
    }

    private async decided(card: Card, decision: ProposalDecision | null): Promise<void> {
        card.gone = true;
        this.cards.delete(card);
        (card.handle.el.win ?? window).clearTimeout(card.timer);
        // Dismissed, cancelled, or the Reader closing: whatever comes back is dropped, nothing recorded.
        if (!decision) {
            card.job?.cancel();
            return;
        }
        const { move, passage } = card;
        // The verdict is yours, given now (§XII): descriptors only, never the text (FR-8, AC-4).
        const verdict = { path: passage.book, subject: `reader-ai:${move.id}`, origin: "ai" as const, verdict: decision.verdict };
        if (decision.verdict === "rejected") {
            this.judgements.record(verdict);
            return;
        }
        try {
            const thought = await withWriteBatch({ kind: "manual", ref: "reader-ai-move", label: passage.book }, () =>
                this.store.write(decision.text, {
                    about: passage.book,
                    quote: passage.quote,
                    locator: passage.locator,
                    ...(passage.highlight ? { respondsTo: { to: passage.highlight.id, as: move.thread } } : {}),
                    madeBy: { move: move.id, ai: true },
                })
            );
            if (!thought) throw new Error("not written");
            // Recorded once the thought exists: a kept verdict always has its thought.
            this.judgements.record(verdict);
            this.moves.record({ primitive: primitiveOf(move), verb: move.verb, subject: thought.id });
            // A claim you accepted is one step from a claim note (#762): *Claim* beside its row.
            const made = move.id === "claim" && this.view.claim ? { claim: (from: ProposalBox) => this.view.claim?.(thought, from) } : {};
            this.view.addFromReading({ kind: "thought", path: thoughtPath(this.store.folder(), thought), title: t(AI_MOVE_KEY[move.id]), ...made });
        } catch (error) {
            log.warn(`[reader] an AI move was not kept: ${error instanceof Error ? error.name : "error"}`);
        }
    }
}

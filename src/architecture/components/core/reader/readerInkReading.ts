import type { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { aiMaxInputChars, type AiGateState, type AiSettings } from "architecture/ai/aiGate";
import type { AiImage, AiProvider } from "architecture/ai/AiProvider";
import { AiService } from "architecture/ai/AiService";
import { AiVisionError } from "architecture/ai/openaiCompatibleLogic";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { KnowledgeIndex } from "architecture/knowledge";
import { openZettelFlowSettings } from "architecture/components/core/surface/openSettings";
import { buildInkReadingRequest, INK_READING_TASK, matchNamedNote, parseInkReading, proposedMove, type InkMove } from "application/reader/ink/inkReading";
import { isUnreadable, parseInkSvg, type InkDrawing } from "application/reader/ink/inkSvg";
import { thoughtPath, type Thought } from "application/thinking/thought";
import { inkImage } from "./readerInkImage";
import { openProposal, type ProposalBox, type ProposalDecision, type ProposalHandle } from "./readerProposal";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **Handwriting read as a proposal** (#748, epic #740) — the runtime: one press reads one ink note.
 *
 * The state diagram of the spec, exactly:
 *
 * - **Ink** — the chip says *Ink · kept as you wrote it* and offers **Read as text**.
 * - **No provider** — AI off or not set up: the chip says so and Settings › AI opens. Nothing is sent.
 * - **Reading** — one request, to your endpoint: an image of this note's strokes and its passage. The
 *   chip breathes *Reading…* with **Cancel**; so do the strokes. One at a time per ink note.
 * - **Proposed** — the reading, on a card grown from the chip (`openProposal`): Accept, Edit, Reject.
 *   Nothing is written before a verdict; the drawing is never written at all.
 * - **Read** — the reading is the thought's text (searchable), and the chip says *Read as: "…"*.
 * - **Move** — only on a reading you confirmed: a tension with a note **you have** (matched here,
 *   locally), or a question. Its own card, its own verdict; rejecting it keeps the reading.
 *
 * Every verdict lands in the judgement record as descriptors only (§XII) — the thought, `ink-reading`
 * or `ink-move:*`, origin `ai`, the verdict. No reading text, no image and no model output reach the
 * record or the log.
 *
 * {@link InkReadingController.read} is the only door, and only a press reaches it: the chip's button
 * and the lasso's *Read as text*. Nothing reads ink by itself (FR-1, AC-9).
 */

/** The AI layer, as reading ink uses it — `AiService` unless a test gives another. */
export interface InkReadingAi {
    gate(): AiGateState;
    config(): AiSettings;
    getProvider(): AiProvider;
}

export interface InkReadingDeps {
    app: App;
    store: {
        folder(): string;
        drawingOf(thought: Thought): Promise<string | undefined>;
        save(thought: Thought): Promise<void>;
    };
    /** Where the proposal cards live: a positioned element (the Reader's root, Think's view). */
    host(): HTMLElement | null;
    /** The passage the ink note sits beside — the only text sent with it. */
    passageOf(thought: Thought): string;
    /** A reading or a move was written: the thought as it is now. */
    saved?(thought: Thought): void;
    /** The note is being read, or no longer: its strokes breathe meanwhile. */
    breathing?(thought: Thought, on: boolean): void;
    /** The ink note's entry where an accepted tension lands (FR-19), when there is one. */
    entryOf?(thought: Thought): HTMLElement | null;
    ai?: InkReadingAi;
    /** The titles of your notes in scope, to match a named idea locally (FR-8). */
    titles?(): { path: string; title: string }[];
    /** The strokes alone, as an image (FR-3). */
    image?(drawing: InkDrawing, at: HTMLElement): AiImage | null;
}

/** What a chip says: the ink, a reading in flight, or a word after one. */
type ChipState = { kind: "idle" } | { kind: "reading" } | { kind: "proposed" } | { kind: "said"; key: LocaleKey };

interface Chip {
    el: HTMLElement;
    listen: (el: HTMLElement, run: () => void) => void;
}

/** How long a word after a reading (*Could not read this ink…*) stays before the chip is the ink's again. */
const SAID_MS = 8000;

function noteBasename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export class InkReadingController {
    private readonly chips = new Map<string, Set<Chip>>();
    private readonly states = new Map<string, ChipState>();
    private readonly latest = new Map<string, Thought>();
    /** The reading in flight per ink note, by its generation: Cancel and a newer press make it stale. */
    private readonly inFlight = new Map<string, number>();
    private generation = 0;
    private cards = new Set<ProposalHandle>();
    /** Where a reading was asked from, when its chip is out of sight: the note on the page. */
    private readonly origins = new Map<string, HTMLElement | ProposalBox>();
    private timers = new Map<string, number>();
    private disposed = false;

    constructor(private readonly deps: InkReadingDeps) {}

    /**
     * The chip under an ink note (FR-1, FR-10): *Ink · kept as you wrote it* · **Read as text**, or
     * *Read as: "…"* once a reading is its text. `listen` is the owner's — its listeners go with it.
     */
    renderChip(parent: HTMLElement, thought: Thought, listen: (el: HTMLElement, run: () => void) => void): HTMLElement {
        this.latest.set(thought.id, thought);
        const el = parent.createDiv({ cls: c("reader-ink-chip"), attr: { "data-ink-chip": thought.id } });
        const chip: Chip = { el, listen };
        let set = this.chips.get(thought.id);
        if (!set) this.chips.set(thought.id, (set = new Set()));
        // Chips of a list drawn again are gone: only the ones still on screen are kept.
        for (const old of set) if (!old.el.isConnected) set.delete(old);
        set.add(chip);
        this.paintChip(chip, thought.id);
        return el;
    }

    /**
     * Read one ink note (FR-1): the only door. Reached from a press — the chip's **Read as text** and
     * the lasso's — and from nothing else.
     */
    async read(thought: Thought, origin?: HTMLElement | ProposalBox): Promise<void> {
        if (this.disposed) return;
        const id = thought.id;
        this.latest.set(id, thought);
        // One request at a time per ink note (FR-11): a second press while it reads — or while its
        // proposal is up (the lasso can press again) — sends nothing.
        if (this.inFlight.has(id) || this.states.get(id)?.kind === "proposed") return;
        const ai = this.deps.ai ?? AiService.getInstance();
        // FR-2: no provider — say so, open Settings › AI, and send nothing.
        if (ai.gate() !== "ready") {
            this.say(id, "reader_ink_needs_ai");
            openZettelFlowSettings(this.deps.app, "ai");
            return;
        }
        const provider = ai.getProvider();
        if (typeof provider.see !== "function") {
            this.say(id, "reader_ink_no_image");
            return;
        }
        const generation = ++this.generation;
        this.inFlight.set(id, generation);
        this.setState(id, { kind: "reading" });
        this.deps.breathing?.(thought, true);
        let raw: string;
        try {
            const host = this.deps.host();
            const text = await this.deps.store.drawingOf(thought);
            const drawing = text === undefined ? null : parseInkSvg(text);
            if (!host || !drawing || isUnreadable(drawing)) throw new AiVisionError("failed");
            const image = (this.deps.image ?? inkImage)(drawing, host);
            if (!image) throw new AiVisionError("failed");
            // The whole prompt within the input cap: the task, then as much passage as is left.
            const maxChars = Math.max(200, aiMaxInputChars(ai.config()) - INK_READING_TASK.length);
            const { prompt } = buildInkReadingRequest({ passage: this.deps.passageOf(thought), maxChars });
            if (this.inFlight.get(id) !== generation) return;
            raw = await provider.see(prompt, image);
        } catch (error) {
            if (this.inFlight.get(id) !== generation) return;
            this.stopReading(thought);
            const kind = error instanceof AiVisionError ? error.kind : "failed";
            // A warning, never content: no reading, no image, no body.
            log.warn(`[reader] ink reading failed: ${kind}`);
            this.say(id, kind === "no-image" ? "reader_ink_no_image" : "reader_ink_read_failed");
            return;
        }
        // Cancelled while it read (or the reader closed): the answer is dropped, nothing is written.
        if (this.inFlight.get(id) !== generation || this.disposed) return;
        this.stopReading(thought);
        const parsed = parseInkReading(raw);
        if (!parsed) {
            log.warn("[reader] ink reading failed: empty");
            this.say(id, "reader_ink_read_failed");
            return;
        }
        await this.propose(id, parsed, origin);
    }

    /**
     * Read each ink note a lasso caught (FR-12): one request per note, each its own proposal — and,
     * with no provider, one word and one Settings, not one per note.
     */
    readEach(notes: readonly { thought: Thought; origin?: HTMLElement | ProposalBox }[]): void {
        const ai = this.deps.ai ?? AiService.getInstance();
        const all = ai.gate() === "ready" ? notes : notes.slice(0, 1);
        for (const note of all) void this.read(note.thought, note.origin);
    }

    /** Whether a proposal card is up: Esc dismisses it first. */
    hasCards(): boolean {
        return this.cards.size > 0;
    }

    /** Esc on the Reader: the newest card goes, with no verdict. */
    dismissNewest(): void {
        const newest = [...this.cards].pop();
        newest?.dismiss();
    }

    /** Whether this ink note is being read now. */
    isReading(id: string): boolean {
        return this.inFlight.has(id);
    }

    /** Cancel a reading in flight (FR-11): stop waiting; the answer, if it comes, is dropped. */
    cancel(id: string): void {
        if (!this.inFlight.has(id)) return;
        this.inFlight.delete(id);
        const thought = this.latest.get(id);
        if (thought) this.deps.breathing?.(thought, false);
        log.warn("[reader] ink reading failed: cancelled");
        this.say(id, "reader_ink_read_failed");
    }

    /** The reader closes: cards go without a verdict, readings in flight are dropped. */
    dispose(): void {
        this.disposed = true;
        for (const card of this.cards) card.dismiss();
        this.cards.clear();
        this.inFlight.clear();
        for (const timer of this.timers.values()) this.win().clearTimeout(timer);
        this.timers.clear();
        this.chips.clear();
    }

    // ── the proposals ────────────────────────────────────────────────────────

    private async propose(id: string, parsed: { reading: string; kind: string; names?: string }, origin?: HTMLElement | ProposalBox): Promise<void> {
        const host = this.deps.host();
        const thought = this.latest.get(id);
        if (!host || !thought) return;
        if (origin) this.origins.set(id, origin);
        const from = this.chipOf(id) ?? origin ?? host;
        const card = openProposal(host, from, {
            intro: t("reader_proposal_reads_as", parsed.reading),
            text: parsed.reading,
            editable: true,
            landing: () => this.chipBox(id) ?? this.originBox(id),
        });
        this.cards.add(card);
        this.setState(id, { kind: "proposed" });
        const decision = await card.decision;
        this.cards.delete(card);
        // A dismissal is not a verdict: nothing written, nothing recorded. A verdict given is kept even
        // if the reader closed while its card was leaving (the store outlives the view).
        if (!decision) {
            this.setState(id, { kind: "idle" });
            return;
        }
        // The verdict is the user's, given now: recorded even if the write below then fails (it says so).
        this.judge(thought, "ink-reading", decision.verdict);
        if (decision.verdict === "rejected") {
            // FR-7: the chip offers *Read as text* again.
            this.setState(id, { kind: "idle" });
            return;
        }
        // The card has landed in the chip: its words appear there now, as it arrives (FR-17).
        if (!(await this.write({ ...thought, text: decision.text }))) return;
        // Then a move, only on a reading you confirmed (FR-8) — matched here, locally, never by the model.
        const titles = this.deps.titles ? this.deps.titles() : KnowledgeIndex.getInstance().getModel().all().map((idea) => ({ path: idea.path, title: idea.title }));
        const move = proposedMove(parsed as Parameters<typeof proposedMove>[0], matchNamedNote(parsed.names, titles));
        if (move) await this.proposeMove(id, move);
    }

    private async proposeMove(id: string, move: InkMove): Promise<void> {
        const host = this.deps.host();
        const thought = this.latest.get(id);
        if (!host || !thought) return;
        const subject = move.kind === "tension" ? "ink-move:tension" : "ink-move:question";
        // A following proposal grows from the same chip (FR-17); an accepted tension lands on its entry (FR-19).
        const card = openProposal(host, this.chipOf(id) ?? this.origins.get(id) ?? host, {
            intro: move.kind === "tension" ? t("reader_ink_move_tension", noteBasename(move.path)) : t("reader_ink_move_question"),
            landing: () => {
                const entry = move.kind === "tension" ? this.deps.entryOf?.(thought) : null;
                return entry && this.onScreen(entry) ? entry.getBoundingClientRect() : (this.chipBox(id) ?? this.originBox(id));
            },
        });
        this.cards.add(card);
        const decision = await card.decision;
        this.cards.delete(card);
        if (!decision) return;
        this.judge(thought, subject, decision.verdict);
        // Rejecting the move keeps the reading (FR-8).
        if (decision.verdict === "rejected") return;
        if (move.kind === "tension") {
            // What *challenge* writes by hand in Think: a thought about both, and the move recorded.
            if (await this.write({ ...thought, alsoAbout: move.path })) MoveLog.getInstance().record({ primitive: "perturb", verb: "challenge", subject: thought.id });
        } else {
            await this.write({ ...thought, meaning: "question" });
        }
    }

    /**
     * One write of the thought, in its own batch — the drawing is never part of it (FR-6, AC-4). The
     * chip shows the thought as it will be at once, and goes back if the write fails.
     */
    private async write(next: Thought): Promise<boolean> {
        const before = this.latest.get(next.id);
        this.latest.set(next.id, next);
        this.setState(next.id, { kind: "idle" });
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-ink-reading", label: next.about ?? "" }, () => this.deps.store.save(next));
        } catch (error) {
            if (before) this.latest.set(next.id, before);
            log.warn(`[reader] ink reading not kept: ${error instanceof Error ? error.name : "error"}`);
            this.say(next.id, "reader_ink_read_failed");
            return false;
        }
        this.deps.saved?.(next);
        return true;
    }

    /** A verdict, as descriptors only (FR-9, AC-7). */
    private judge(thought: Thought, subject: string, verdict: ProposalDecision["verdict"]): void {
        const folder = this.deps.store.folder();
        if (!folder) return;
        JudgementLog.getInstance().record({ path: thoughtPath(folder, thought), subject, origin: "ai", verdict });
    }

    // ── the chip ─────────────────────────────────────────────────────────────

    /** The window the cards live in: a pop-out's own. */
    private win(): Window {
        return this.deps.host()?.win ?? window;
    }

    private stopReading(thought: Thought): void {
        this.inFlight.delete(thought.id);
        this.deps.breathing?.(thought, false);
    }

    private say(id: string, key: LocaleKey): void {
        this.setState(id, { kind: "said", key });
        const win = this.win();
        win.clearTimeout(this.timers.get(id));
        this.timers.set(
            id,
            win.setTimeout(() => {
                this.timers.delete(id);
                if (this.states.get(id)?.kind === "said") this.setState(id, { kind: "idle" });
            }, SAID_MS)
        );
    }

    private setState(id: string, state: ChipState): void {
        this.states.set(id, state);
        this.paint(id);
    }

    private paint(id: string): void {
        for (const chip of this.chips.get(id) ?? []) this.paintChip(chip, id);
    }

    private paintChip(chip: Chip, id: string): void {
        const state = this.states.get(id) ?? { kind: "idle" };
        const thought = this.latest.get(id);
        const el = chip.el;
        el.empty();
        el.toggleClass(c("reader-ink-chip--reading"), state.kind === "reading");
        el.toggleClass(c("reader-ink-chip--read"), state.kind === "idle" && Boolean(thought?.text.trim()));
        el.toggleClass(c("reader-ink-chip--said"), state.kind === "said");
        if (state.kind === "reading") {
            el.createSpan({ cls: c("reader-ink-chip-label"), text: t("reader_ink_reading"), attr: { role: "status" } });
            const cancel = el.createEl("button", { cls: c("reader-ink-chip-action"), text: t("reader_hl_cancel"), attr: { type: "button" } });
            chip.listen(cancel, () => this.cancel(id));
            return;
        }
        const text = thought?.text.trim() ?? "";
        const label = state.kind === "said" ? t(state.key) : text ? t("reader_ink_read_as", text) : t("reader_ink_chip");
        el.createSpan({ cls: c("reader-ink-chip-label"), text: label, attr: state.kind === "said" ? { role: "status" } : {} });
        // While its proposal is up, the chip is only the ink's: the card is where you decide.
        if (state.kind === "proposed" || (text && state.kind !== "said")) return;
        const read = el.createEl("button", { cls: c("reader-ink-chip-action"), text: t("reader_ink_read"), attr: { type: "button" } });
        chip.listen(read, () => {
            const latest = this.latest.get(id);
            if (latest) void this.read(latest, el);
        });
    }

    /**
     * The chip on screen for this ink note, if one is — a chip scrolled out of sight (a long margin
     * list, read from the lasso) is not where a card grows from: the ink note on the page is.
     */
    private chipOf(id: string): HTMLElement | null {
        for (const chip of this.chips.get(id) ?? []) if (this.onScreen(chip.el)) return chip.el;
        return null;
    }

    /** Whether an element is in the host's visible box. */
    private onScreen(el: HTMLElement): boolean {
        if (!el.isConnected) return false;
        const host = this.deps.host()?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return !host || (r.width > 0 && r.top + r.height > host.top && r.top < host.top + host.height && r.left + r.width > host.left && r.left < host.left + host.width);
    }

    private originBox(id: string): ProposalBox | null {
        const origin = this.origins.get(id);
        if (!origin) return null;
        if ("getBoundingClientRect" in origin && typeof origin.getBoundingClientRect === "function") {
            const r = origin.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        }
        return origin as ProposalBox;
    }

    private chipBox(id: string): ProposalBox | null {
        const el = this.chipOf(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
}

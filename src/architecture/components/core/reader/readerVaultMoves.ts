import { TFile, setIcon, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { chapterVerdict, vaultConnections, vaultContradictions, type Judgement, type VaultCandidate } from "architecture/knowledge/state";
import { JudgementLog, type JudgementEntry } from "architecture/plugin/judgement/JudgementLog";
import { MoveLog, type MoveEntry } from "architecture/plugin/thinking/MoveLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { addSourceEntries } from "architecture/plugin/library/sourceWrites";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { boundQuote, placeOf, readSourceEntry, samePlace, sourceEntry, type PassagePlace } from "application/library/provenance";
import { sourceFormat } from "application/library/sourceMeta";
import type { Thought, ThoughtLocator, ThoughtMadeBy, ThoughtQuote, Response } from "application/thinking/thought";
import { flightTransform, MOTION, motionWelcome } from "./readerMotion";
import { openProposal, nextProposalSeq, type ProposalBox, type ProposalDecision, type ProposalHandle, type ProposalOwner } from "./readerProposal";
import type { FromReadingEntry, NearNow } from "./readerAlongside";
import type { ThinkPassage } from "./readerHighlights";
import type { PickerChoice } from "./readerIdeaPicker";

/**
 * **Contradict and Connect — moves answered by your vault** (#756, epic #741).
 *
 * Two moves on a passage you selected or marked, answered by the vault with no AI (FR-13): which of
 * your notes stand against it (`vaultContradictions`), which of your ideas it belongs with
 * (`vaultConnections`). The answer is a **proposal** at the top of *Alongside* (FR-4) — the Reader's
 * own proposal card (#748), one per candidate, each with Accept, Modify and Reject. Nothing is
 * written until you decide (§XII), and every verdict is recorded:
 *
 * | Verdict | Written | Recorded |
 * |---|---|---|
 * | Contradict, accepted or modified | one tension thought in Think: about the book and the note, quoting the passage | the verdict, and the move `perturb · counterexample` |
 * | Connect, accepted or picked | the idea's `source` gains the passage, one recorded property write | the verdict, and the move `explore · analogy` |
 * | Reject | nothing | *Not related* for this chapter — the same verdict as Alongside's |
 * | Dismiss (Esc, close) | nothing | nothing |
 *
 * The card holds its passage, so a verdict works after the selection is gone or the page turned
 * (FR-11). Undecided cards live for this session only (FR-12).
 */

export type VaultMoveId = "contradict" | "connect";

/** How long the vault may take before the card says it is looking (FR-16). */
export const LOOKING_MS = 150;
/** How far a rejected candidate slides as it goes (FR-18). */
export const REJECT_SLIDE_PX = 16;

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key. */
const MOVE_KEY: Record<VaultMoveId, LocaleKey> = { contradict: "reader_move_contradict", connect: "reader_move_connect" };
const EMPTY_KEY: Record<VaultMoveId, LocaleKey> = { contradict: "reader_contradict_empty", connect: "reader_connect_empty" };
const NEAR_REASON_KEY: Record<string, LocaleKey> = {
    named: "reader_connect_reason_named",
    "born-chapter": "reader_connect_reason_born",
    "born-book": "reader_connect_reason_born",
    mark: "reader_connect_reason_mark",
    "chapter-note": "reader_connect_reason_named",
};
const NEIGHBOUR_KEY: Record<"supports" | "expands", { toward: LocaleKey; from: LocaleKey }> = {
    supports: { toward: "reader_connect_reason_supports", from: "reader_connect_reason_supported" },
    expands: { toward: "reader_connect_reason_expands", from: "reader_connect_reason_expanded" },
};
/** What each move logs, in the vocabulary of #489 — never a twelfth verb (FR-9, AC-12). */
const MOVE_LOGGED: Record<VaultMoveId, Pick<MoveEntry, "primitive" | "verb">> = {
    contradict: { primitive: "perturb", verb: "counterexample" },
    connect: { primitive: "explore", verb: "analogy" },
};

/** A passage a move works on, and the book and chapter it is in. */
export interface VaultMovePassage extends ThinkPassage {
    book: string;
    bookTitle: string;
}

/** What the Reader lends the moves. */
export interface VaultMovesView {
    app: App;
    /** Alongside open, and where proposals go — `opened` when it was closed and opens now (FR-4). */
    openAlongside(): { host: HTMLElement; opened: boolean } | null;
    nearFor(text: string): NearNow | null;
    fromReadingBox(): ProposalBox | null;
    addFromReading(entry: FromReadingEntry): void;
    ruleOut(book: string, chapterKey: string, path: string): void;
    /** An accepted tension ticks the highlight it answers (FR-17). */
    tension(highlightId: string): void;
}

interface StoreLike {
    folder(): string;
    all(): Promise<Thought[]>;
    write(text: string, options: { about?: string; alsoAbout?: string; quote?: ThoughtQuote; locator?: ThoughtLocator; respondsTo?: Response; madeBy?: ThoughtMadeBy }): Promise<Thought | undefined>;
}

/** Seams for tests: the stores, the record, the move log and the one property write. */
export interface VaultMovesDeps {
    store?: StoreLike;
    judgements?: { record(entry: JudgementEntry): Judgement | null };
    moves?: { record(entry: MoveEntry): unknown };
    addSource?: (path: string, entries: readonly string[]) => Promise<boolean>;
    /** A note's `source` values, to leave out the notes that already cite the passage. */
    sourcesOf?: (path: string) => readonly unknown[];
}

interface Group {
    el: HTMLElement;
    list: HTMLElement;
    line: HTMLElement;
    cards: Set<ProposalHandle>;
    seq: number;
    gone: boolean;
    arrival: Animation | null;
    dismiss(): void;
}

/** A passage's chapter key, as Alongside and the verdicts name it (#751): the spine path, or `page:N`. */
export function chapterKeyOf(book: string, locator: ThoughtLocator): string {
    return locator.chapter ?? (sourceFormat(book) === "pdf" ? `page:${locator.at}` : String(locator.at));
}

/** The passage's place, as a `source` entry cites it (#751). */
export function placeOfPassage(passage: VaultMovePassage): PassagePlace {
    const { locator } = passage;
    return {
        file: passage.book,
        chapter: chapterKeyOf(passage.book, locator),
        label: locator.label,
        ...(locator.page ? { page: locator.page } : {}),
        quote: boundQuote(passage.quote),
        title: passage.bookTitle,
    };
}

/** The line a candidate says (FR-2, FR-3): why your vault offers it. */
export function reasonLine(candidate: VaultCandidate): string {
    const reason = candidate.reason;
    switch (reason.kind) {
        case "contradicts":
            return t(reason.named ? "reader_contradict_reason_named" : "reader_contradict_reason_near", candidate.title, reason.ofTitle);
        case "near":
            return t(NEAR_REASON_KEY[reason.near] ?? "reader_connect_reason_named");
        case "supports":
        case "expands":
            return t(reason.toward ? NEIGHBOUR_KEY[reason.kind].toward : NEIGHBOUR_KEY[reason.kind].from, reason.ofTitle);
        case "shared":
            return t("reader_connect_reason_shared", reason.ofTitle);
    }
}

function snippet(text: string, max = 160): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Change what is in `host`, and move what follows it in the panel from where it was to where it is
 * now — transform only, the base beat — so the panel never jumps (§XVI). `animate` false: just change.
 */
export function makeRoom(host: HTMLElement, animate: boolean, change: () => void): void {
    const after: { el: HTMLElement; top: number }[] = [];
    if (animate) {
        for (let next = host.nextElementSibling as HTMLElement | null; next; next = next.nextElementSibling as HTMLElement | null) {
            after.push({ el: next, top: next.getBoundingClientRect().top });
        }
    }
    change();
    for (const { el, top } of after) {
        if (!motionWelcome(el)) continue;
        const dy = Math.round(top - el.getBoundingClientRect().top);
        if (Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(0px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], { duration: MOTION.base, easing: MOTION.ease });
    }
}

export class ReaderVaultMoves implements ProposalOwner {
    private readonly groups: Group[] = [];
    private readonly store: StoreLike;
    private readonly judgements: NonNullable<VaultMovesDeps["judgements"]>;
    private readonly moves: NonNullable<VaultMovesDeps["moves"]>;
    private readonly addSource: NonNullable<VaultMovesDeps["addSource"]>;
    private readonly sourcesOf: NonNullable<VaultMovesDeps["sourcesOf"]>;
    private disposed = false;

    constructor(
        private readonly view: VaultMovesView,
        deps: VaultMovesDeps = {}
    ) {
        this.store = deps.store ?? ThoughtStore.getInstance();
        this.judgements = deps.judgements ?? JudgementLog.getInstance();
        this.moves = deps.moves ?? MoveLog.getInstance();
        this.addSource =
            deps.addSource ??
            (async (path, entries) => {
                const file = view.app.vault.getAbstractFileByPath(path);
                return file instanceof TFile ? addSourceEntries(file, entries) : false;
            });
        this.sourcesOf =
            deps.sourcesOf ??
            ((path) => {
                const file = view.app.vault.getAbstractFileByPath(path);
                const front = file instanceof TFile ? view.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
                return front ? ([front.source, front.sources] as unknown[]).flat() : [];
            });
    }

    // ── the first Esc step (#748): the newest card, whoever owns it ─────────

    hasCards(): boolean {
        return this.groups.length > 0;
    }

    newestSeq(): number {
        return this.groups.reduce((max, group) => Math.max(max, group.seq), 0);
    }

    dismissNewest(): void {
        const newest = [...this.groups].sort((a, b) => b.seq - a.seq)[0];
        newest?.dismiss();
    }

    /** Every card goes with no verdict: the panel closed, the Reader closed (FR-12, AC-7). */
    dismissAll(): void {
        for (const group of [...this.groups]) group.dismiss();
    }

    dispose(): void {
        this.disposed = true;
        this.dismissAll();
    }

    // ── a move ───────────────────────────────────────────────────────────────

    /** Make `move` on `passage`, asked for from `from` (the button's box): the answer is born there. */
    async run(move: VaultMoveId, passage: VaultMovePassage, from: ProposalBox): Promise<void> {
        const alongside = this.view.openAlongside();
        if (!alongside) return;
        const win = alongside.host.win ?? window;
        let group: Group | null = null;
        // No waiting room (FR-16): the line only if the vault is slow, as text — never a spinner.
        const timer = win.setTimeout(() => {
            makeRoom(alongside.host, !alongside.opened, () => {
                group = this.openGroup(alongside.host, move, passage);
                group.line.setText(t("reader_looking_in_vault"));
                group.line.removeClass(c("reader-hidden"));
            });
        }, LOOKING_MS);
        const answer = await this.answer(move, passage);
        win.clearTimeout(timer);
        if (this.disposed) return;
        const waited = group !== null;
        if ((group as Group | null)?.gone) return;
        let made: Group | null = group;
        // What was in the panel makes room for the answer by moving down, never by a jump (§XVI).
        makeRoom(alongside.host, !alongside.opened, () => {
            const shown: Group = made ?? this.openGroup(alongside.host, move, passage);
            made = shown;
            if (answer.kind !== "ready" || answer.candidates.length === 0) {
                shown.line.setText(t(answer.kind === "no-lab" ? "reader_hl_no_lab" : EMPTY_KEY[move]));
                shown.line.removeClass(c("reader-hidden"));
                // Nothing to accept: the answer is dismissed in one click (FR-10).
                const close = shown.list.createEl("button", { cls: c("reader-proposal-group-dismiss"), attr: { type: "button" }, text: t("reader_proposal_dismiss") });
                close.addEventListener("click", () => shown.dismiss());
            } else {
                shown.line.addClass(c("reader-hidden"));
                for (const candidate of answer.candidates) this.offer(shown, move, passage, candidate, answer.choices);
            }
        });
        const shown = made as unknown as Group;
        // Born from the button (FR-15): one flight onto its place, unless it rides the panel in, or
        // it stood waiting already — then its body lands in place.
        if (!waited) this.flyIn(shown, from, alongside.opened);
        const first = [...shown.cards][0]?.el.querySelector("button.mod-cta") as HTMLElement | null | undefined;
        first?.focus({ preventScroll: true });
    }

    /** What the vault says, before anything is drawn. */
    private async answer(move: VaultMoveId, passage: VaultMovePassage): Promise<{ kind: "ready"; candidates: VaultCandidate[]; choices?: (query: string) => readonly PickerChoice[] } | { kind: "no-lab" } | { kind: "failed" }> {
        try {
            if (move === "contradict" && !this.store.folder()) return { kind: "no-lab" };
            const now = this.view.nearFor(passage.quote.exact);
            if (!now) return { kind: "ready", candidates: [] };
            const place = placeOfPassage(passage);
            if (move === "contradict") {
                const tensions = new Set<string>();
                for (const thought of await this.store.all()) {
                    const other = thought.alsoAbout ? placeOf(thought) : null;
                    if (thought.alsoAbout && other && samePlace(other, place)) tensions.add(thought.alsoAbout);
                }
                return { kind: "ready", candidates: vaultContradictions(now.model, now.near, { ruledOut: now.ruledOut, tensions, book: passage.book }) };
            }
            const cites = (path: string) =>
                this.sourcesOf(path).some((value) => {
                    const other = readSourceEntry(value);
                    return Boolean(other?.quote && samePlace(other, place));
                });
            const candidates = vaultConnections(now.model, now.near, { ruledOut: now.ruledOut, cites, ruledOutGap: now.ruledOutGap, book: passage.book });
            // Modify on Connect (FR-7): any idea in scope, the near ones first before you type.
            const model = now.model;
            const first = now.near.map((item) => ({ value: item.path, label: item.title }));
            const choices = (query: string): readonly PickerChoice[] => {
                if (!query) return first.length > 0 ? first : model.all().slice(0, 6).map((idea) => ({ value: idea.path, label: idea.title }));
                const q = query.toLowerCase();
                return model
                    .all()
                    .filter((idea) => idea.path !== passage.book && idea.title.toLowerCase().includes(q))
                    .sort((a, b) => a.title.localeCompare(b.title, "en"))
                    .map((idea) => ({ value: idea.path, label: idea.title }));
            };
            return { kind: "ready", candidates, choices };
        } catch (error) {
            log.warn(`[Reader] a move could not read the vault: ${error instanceof Error ? error.name : "error"}`);
            return { kind: "failed" };
        }
    }

    /** The answer's card at the top of Alongside: the move, where it came from, the passage (FR-4). */
    private openGroup(host: HTMLElement, move: VaultMoveId, passage: VaultMovePassage): Group {
        const el = host.createDiv({ cls: c("reader-proposal-group"), attr: { role: "dialog", "aria-label": t("reader_proposal_header") } });
        const head = el.createDiv({ cls: c("reader-proposal-group-head") });
        head.createDiv({ cls: c("reader-proposal-group-header"), text: t("reader_proposal_header") });
        const close = head.createEl("button", { cls: ["clickable-icon", c("reader-proposal-group-close")].join(" "), attr: { type: "button", "aria-label": t("reader_proposal_dismiss") } });
        setIcon(close, "x");
        el.createDiv({ cls: c("reader-proposal-group-origin"), text: t("reader_proposal_from_vault", t(MOVE_KEY[move])) });
        el.createEl("blockquote", { cls: c("reader-proposal-group-passage"), text: snippet(passage.quote.exact) });
        const line = el.createDiv({ cls: [c("reader-proposal-group-line"), c("reader-hidden")] });
        const list = el.createDiv({ cls: c("reader-proposal-group-list") });
        const group: Group = {
            el,
            list,
            line,
            cards: new Set(),
            seq: nextProposalSeq(),
            gone: false,
            arrival: null,
            dismiss: () => {
                if (group.gone) return;
                group.gone = true;
                // A dismissal is not a judgement (FR-9, AC-7): each card goes with no verdict.
                for (const card of [...group.cards]) card.dismiss();
                this.drop(group);
            },
        };
        close.addEventListener("click", () => group.dismiss());
        el.addEventListener("keydown", (event: KeyboardEvent) => {
            this.land(group);
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            group.dismiss();
        });
        el.addEventListener("pointerdown", () => this.land(group));
        this.groups.push(group);
        return group;
    }

    private flyIn(group: Group, from: ProposalBox, opened: boolean): void {
        // Opened now, Alongside slides in carrying the card already in its place: one gesture (FR-15).
        if (opened || !motionWelcome(group.el)) return;
        const r = group.el.getBoundingClientRect();
        const start = flightTransform({ left: r.left, top: r.top, width: r.width, height: r.height }, from);
        group.arrival = group.el.animate(
            [
                { transform: start, opacity: 0 },
                { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
            ],
            { duration: MOTION.base, easing: MOTION.ease }
        );
    }

    /** Input during the flight jumps it to its end (FR-19). */
    private land(group: Group): void {
        try {
            group.arrival?.finish();
        } catch {
            // Already done.
        }
        group.arrival = null;
    }

    private drop(group: Group): void {
        group.gone = true;
        this.land(group);
        const at = this.groups.indexOf(group);
        if (at >= 0) this.groups.splice(at, 1);
        const host = group.el.parentElement;
        // The panel closes over the answer that went: what was under it moves up into its place.
        if (host) makeRoom(host, true, () => group.el.remove());
        else group.el.remove();
    }

    /** One candidate: the Reader's proposal card, in the answer's list. */
    private offer(group: Group, move: VaultMoveId, passage: VaultMovePassage, candidate: VaultCandidate, choices?: (query: string) => readonly PickerChoice[]): void {
        const line = move === "contradict" ? reasonLine(candidate) : t("reader_connect_line", candidate.title);
        const card = openProposal(group.list, group.el, {
            flow: true,
            arrive: "none",
            hint: false,
            title: candidate.title,
            intro: move === "contradict" ? line : reasonLine(candidate),
            text: move === "contradict" ? line : candidate.path,
            editable: move === "contradict",
            editLabel: t("reader_proposal_modify"),
            saveEditLabel: t("reader_proposal_keep"),
            label: t("reader_proposal_candidate", candidate.title),
            rejectSlide: REJECT_SLIDE_PX,
            onEscape: () => group.dismiss(),
            // It folds down into *From this reading* (FR-17) — or, with no place to land, back into its answer.
            landing: () => {
                const box = this.view.fromReadingBox();
                return box && box.width > 0 && box.height > 0 ? box : null;
            },
            ...(move === "connect" && choices ? { choices, pickPlaceholder: t("reader_idea_picker_placeholder") } : {}),
        });
        group.cards.add(card);
        void card.decision.then((decision) => this.decided(group, card, move, passage, candidate, decision));
    }

    private async decided(group: Group, card: ProposalHandle, move: VaultMoveId, passage: VaultMovePassage, candidate: VaultCandidate, decision: ProposalDecision | null): Promise<void> {
        group.cards.delete(card);
        if (!group.gone && group.cards.size === 0) this.drop(group);
        if (!decision) return;
        const chapterKey = chapterKeyOf(passage.book, passage.locator);
        if (decision.verdict === "rejected") {
            // *Not related* for this chapter: exactly Alongside's verdict, so it leaves there too (FR-8).
            this.judgements.record(chapterVerdict(candidate.path, passage.book, chapterKey));
            this.view.ruleOut(passage.book, chapterKey, candidate.path);
            return;
        }
        const target = move === "connect" ? decision.text : candidate.path;
        // The verdict is yours, given now: descriptors only, never the text (FR-9).
        this.judgements.record({ path: target, subject: `reader-${move}:${passage.book}#${chapterKey}`, origin: "derived", verdict: decision.verdict });
        try {
            if (move === "contradict") {
                const thought = await withWriteBatch({ kind: "manual", ref: "reader-move", label: passage.book }, () =>
                    this.store.write(decision.text, {
                        about: passage.book,
                        alsoAbout: candidate.path,
                        quote: passage.quote,
                        locator: passage.locator,
                        ...(passage.highlight ? { respondsTo: { to: passage.highlight.id, as: "challenge" as const } } : {}),
                        madeBy: { move: "contradict" },
                    })
                );
                if (!thought) throw new Error("not written");
                this.moves.record({ ...MOVE_LOGGED.contradict, subject: thought.id });
                this.view.addFromReading({ kind: "tension", path: candidate.path, title: candidate.title });
                if (passage.highlight) this.view.tension(passage.highlight.id);
            } else {
                await this.addSource(target, [sourceEntry(placeOfPassage(passage))]);
                this.moves.record({ ...MOVE_LOGGED.connect, subject: target });
                const title = target === candidate.path ? candidate.title : (target.split("/").pop() ?? target).replace(/\.md$/i, "");
                this.view.addFromReading({ kind: "connection", path: target, title });
            }
        } catch (error) {
            log.warn(`[Reader] a move was not kept: ${error instanceof Error ? error.message : "error"}`);
        }
    }
}

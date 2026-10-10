import { setIcon, TFile, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { createClaimNote, type ClaimCreateOutcome } from "architecture/plugin/library/claimWrites";
import { addSourceEntries } from "architecture/plugin/library/sourceWrites";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { JudgementLog, type JudgementEntry } from "architecture/plugin/judgement/JudgementLog";
import { safeName } from "architecture/plugin/thinking/crystallizeThought";
import { FolderSuggest } from "architecture/settings/suggesters/FolderSuggest";
import { claimDefaults, claimTitle, renderClaimNote } from "application/library/claimFromPassage";
import { readSourceEntry, samePlace, sourceEntry } from "application/library/provenance";
import type { Thought } from "application/thinking/thought";
import { flightTransform, fly, MOTION, motionWelcome } from "./readerMotion";
import { mountIdeaPicker, type IdeaPicker, type PickerChoice, type PickerEmpty } from "./readerIdeaPicker";
import { nextProposalSeq, type ProposalOwner } from "./readerProposal";
import { placeOfPassage, type VaultMovePassage } from "./readerVaultMoves";
import type { FromReadingEntry, NearNow } from "./readerAlongside";

/**
 * **Make it a claim, link it to an idea** (#762, epic #741) — from the selection, sourced to the page.
 *
 * Two gestures a careful reader makes all the time, each **your own act**, not a proposal:
 *
 * | Gesture | Written | Recorded |
 * |---|---|---|
 * | *Claim*, then *Create* | one new note — the claim, its source (#751), the passage quoted — create-only | the write record; one human verdict, `reader-claim` |
 * | *Claim* on a highlight | also the highlight's `claims` (it is kept, never set aside) | the write record |
 * | *Link to an idea*, then a pick | one more entry in the idea's `source` list, through #751's one writer | the write record (undoable); no verdict — it is your choice |
 * | Already linked, a taken name, *Cancel*, Esc | nothing | nothing |
 *
 * The sheet opens in the margin's place — over Alongside, in its slot, never a centred modal — and
 * the picker in the popover the button was in. Nothing here asks an AI anything (FR-10): an accepted
 * *What's the claim* (#759) only prefills the sheet.
 */

type Box = { left: number; top: number; width: number; height: number };

/** How far the sheet slides as it comes and goes: Alongside's own entrance (#754). */
export const SHEET_SLIDE_PX = 32;

/** The folder the last claim went to, for this session: the next one starts there. */
let lastFolder = "";

/** What the Reader lends the two gestures. */
export interface ClaimLinkView {
    app: App;
    /** The reader's root: the words' ghost flies there. */
    host(): HTMLElement;
    /** Alongside open, and its panel — `opened` when it was closed and opens now. */
    openAlongside(): { panel: HTMLElement; opened: boolean } | null;
    /** Close it again: the sheet came with it and goes with it. */
    closeAlongside(): void;
    nearFor(text: string): NearNow | null;
    fromReadingBox(): Box | null;
    addFromReading(entry: FromReadingEntry): void;
    /** A highlight made into a claim keeps its place and gains the tick and the row (FR-5). */
    claimed(highlightId: string, path: string): void;
    /** A claim taken back: the highlight no longer points at it. */
    unclaimed(highlightId: string, path: string): void;
    /** Read a note where you are: *Open it*, a row of *From this reading*. */
    peek(anchor: HTMLElement, path: string, name: string): void;
}

/** What a create comes back as. */
export type CreateOutcome = ClaimCreateOutcome;

/** Seams for tests: the one create, the one property write, the record, the folder field. */
export interface ClaimLinkDeps {
    /** The note at `path`, if one is there — any case on a case-insensitive disk. */
    existing?: (path: string) => string | null;
    createNote?: (path: string, content: string) => Promise<CreateOutcome>;
    addSource?: (path: string, entries: readonly string[]) => Promise<boolean>;
    sourcesOf?: (path: string) => readonly unknown[];
    judgements?: { record(entry: JudgementEntry): unknown };
    folderSuggest?: (input: HTMLInputElement, onChoose: (path: string) => void) => void;
    /** Take one recorded batch back (#454): true when all of it went. */
    undo?: (batch: string) => Promise<boolean>;
}

/** What the sheet opens with, beyond the passage. */
export interface ClaimPrefill {
    /** An accepted *What's the claim* (#759): its sentence. */
    accepted?: Pick<Thought, "text">;
    /** Words to start from instead of the passage's — a search the picker did not find (FR-9). */
    text?: string;
}

interface Sheet {
    el: HTMLElement;
    panel: HTMLElement;
    passage: VaultMovePassage;
    from: Box;
    opened: boolean;
    seq: number;
    quote: HTMLElement;
    moves: Animation[];
    busy: boolean;
}

function snippet(text: string, max = 220): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function rectOf(el: HTMLElement): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const basename = (path: string) => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/** A folder as typed: no leading or trailing slash, the root as "". */
function folderOf(raw: string): string {
    return raw.trim().replace(/^\/+|\/+$/g, "");
}

/**
 * Where an element would be with no transform on `panel` — Alongside sliding in carries the sheet,
 * so the words fly to where the quote **lands**, not to where it is in the first frame.
 */
function landed(box: Box, panel: HTMLElement): Box {
    const style = panel.win?.getComputedStyle?.(panel)?.transform;
    const DOMMatrixCtor = (panel.win as unknown as { DOMMatrixReadOnly?: new (init: string) => { m41: number; m42: number } } | undefined)?.DOMMatrixReadOnly;
    if (!style || style === "none" || !DOMMatrixCtor) return box;
    try {
        const matrix = new DOMMatrixCtor(style);
        // Only the slide's own offset: a bottom sheet's height is its translation, and is kept.
        return panel.hasClass(c("reader-panel--sheet")) ? box : { ...box, left: box.left - matrix.m41 };
    } catch {
        return box;
    }
}

export class ReaderClaimLink implements ProposalOwner {
    private sheet: Sheet | null = null;
    private readonly existing: NonNullable<ClaimLinkDeps["existing"]>;
    private readonly createNote: NonNullable<ClaimLinkDeps["createNote"]>;
    private readonly addSource: NonNullable<ClaimLinkDeps["addSource"]>;
    private readonly sourcesOf: NonNullable<ClaimLinkDeps["sourcesOf"]>;
    private readonly judgements: NonNullable<ClaimLinkDeps["judgements"]>;
    private readonly folderSuggest: NonNullable<ClaimLinkDeps["folderSuggest"]>;
    private readonly undo: NonNullable<ClaimLinkDeps["undo"]>;

    constructor(
        private readonly view: ClaimLinkView,
        deps: ClaimLinkDeps = {}
    ) {
        const vault = () => view.app.vault;
        this.existing =
            deps.existing ??
            ((path) => {
                if (vault().getAbstractFileByPath(path)) return path;
                const lower = path.toLowerCase();
                return vault().getFiles().find((file) => file.path.toLowerCase() === lower)?.path ?? null;
            });
        this.createNote = deps.createNote ?? ((path, content) => createClaimNote(vault(), path, content));
        this.addSource =
            deps.addSource ??
            (async (path, entries) => {
                const file = vault().getAbstractFileByPath(path);
                return file instanceof TFile ? addSourceEntries(file, entries) : false;
            });
        this.sourcesOf =
            deps.sourcesOf ??
            ((path) => {
                const file = vault().getAbstractFileByPath(path);
                const front = file instanceof TFile ? view.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
                return front ? ([front.source, front.sources] as unknown[]).flat() : [];
            });
        this.judgements = deps.judgements ?? JudgementLog.getInstance();
        this.folderSuggest = deps.folderSuggest ?? ((input, onChoose) => new FolderSuggest(input, onChoose));
        this.undo =
            deps.undo ??
            (async (batch) => {
                const outcome = await undoBatch(batch);
                return outcome.hadWork && outcome.failed.length === 0;
            });
    }

    // ── the first Esc step (#748): the sheet goes like a card, newest first ──

    hasCards(): boolean {
        return this.sheet !== null;
    }

    newestSeq(): number {
        return this.sheet?.seq ?? 0;
    }

    dismissNewest(): void {
        this.cancel();
    }

    isOpen(): boolean {
        return this.sheet !== null;
    }

    /** The panel was drawn again (a resize, a turn to portrait): the sheet goes back into it, as it was. */
    attach(panel: HTMLElement): void {
        const sheet = this.sheet;
        if (!sheet) return;
        sheet.panel = panel;
        panel.scrollTop = 0;
        panel.addClass(c("reader-panel--claiming"));
        panel.appendChild(sheet.el);
    }

    /** The panel closed or became another: the sheet goes with it, nothing written. */
    drop(): void {
        const sheet = this.sheet;
        if (!sheet) return;
        this.sheet = null;
        this.settle(sheet);
        sheet.panel.removeClass(c("reader-panel--claiming"));
        sheet.el.remove();
    }

    dispose(): void {
        this.drop();
    }

    // ── make it a claim ──────────────────────────────────────────────────────

    /**
     * Open the sheet for `passage`, asked for from `from` (the selection's box, a row): it slides in
     * where Alongside is while the words travel into its quote — one gesture (FR-12).
     */
    claim(passage: VaultMovePassage, from: Box, prefill: ClaimPrefill = {}): void {
        this.drop();
        const along = this.view.openAlongside();
        if (!along) return;
        const panel = along.panel;
        panel.scrollTop = 0;
        panel.addClass(c("reader-panel--claiming"));
        const defaults = claimDefaults(prefill.text ?? passage.quote.exact, prefill.accepted);
        const sheet: Sheet = { el: panel.createDiv(), panel, passage, from, opened: along.opened, seq: nextProposalSeq(), quote: null as unknown as HTMLElement, moves: [], busy: false };
        this.sheet = sheet;
        this.build(sheet, defaults);
        const welcome = motionWelcome(sheet.el);
        const to = landed(rectOf(sheet.quote), panel);
        // Opened now, Alongside slides in carrying the sheet: its own slide would be a second gesture.
        if (welcome && !along.opened) sheet.moves.push(sheet.el.animate(this.slide(sheet, true), { duration: MOTION.base, easing: MOTION.ease }));
        // In the same frame, the selected words leave the page for the quote.
        if (welcome) this.ghost(passage.quote.exact, from, to);
        const area = sheet.el.querySelector<HTMLTextAreaElement>("textarea");
        area?.focus?.({ preventScroll: true });
    }

    /** The slide in (or, reversed, out): from the edge Alongside comes from, or from below as a sheet. */
    private slide(sheet: Sheet, coming: boolean): Keyframe[] {
        const below = sheet.panel.hasClass(c("reader-panel--sheet"));
        const away = below ? `translate(0px, ${SHEET_SLIDE_PX}px)` : `translate(${SHEET_SLIDE_PX}px, 0px)`;
        const frames: Keyframe[] = [
            { transform: away, opacity: 0 },
            { transform: "translate(0px, 0px)", opacity: 1 },
        ];
        return coming ? frames : frames.reverse();
    }

    /** A ghost of the words, flown from one box to another and gone (transform and opacity). */
    private ghost(text: string, from: Box, to: Box): void {
        const ghost = this.view.host().createDiv({ cls: c("reader-claim-ghost"), text: snippet(text, 160), attr: { "aria-hidden": "true" } });
        fly(this.view.host(), ghost, from, to, { duration: MOTION.base });
    }

    private build(sheet: Sheet, defaults: { claim: string; title: string }): void {
        const el = sheet.el;
        el.addClass(c("reader-claim-sheet"));
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-label", t("reader_claim_sheet_title"));
        const head = el.createDiv({ cls: c("reader-claim-head") });
        head.createDiv({ cls: c("reader-panel-title"), text: t("reader_claim_sheet_title") });
        const close = head.createEl("button", { cls: ["clickable-icon", c("reader-claim-close")].join(" "), attr: { type: "button", "aria-label": t("reader_hl_cancel") } });
        setIcon(close, "x");

        const field = (key: Parameters<typeof t>[0]) => {
            const label = el.createEl("label", { cls: c("reader-claim-field") });
            label.createSpan({ cls: c("reader-claim-label"), text: t(key) });
            return label;
        };
        const area = field("reader_claim_box").createEl("textarea", {
            cls: c("reader-claim-box"),
            attr: { rows: "3", placeholder: t("claim_door_placeholder"), "aria-label": t("reader_claim_box") },
        });
        area.value = defaults.claim;
        const title = field("reader_claim_title").createEl("input", { cls: c("reader-claim-title"), attr: { type: "text", "aria-label": t("reader_claim_title") } });
        title.value = defaults.title;
        // The title follows the claim until you write one of your own.
        let titled = false;
        title.addEventListener("input", () => {
            titled = title.value.trim().length > 0;
        });

        const passage = el.createDiv({ cls: c("reader-claim-field") });
        passage.createSpan({ cls: c("reader-claim-label"), text: t("reader_claim_passage") });
        sheet.quote = passage.createEl("blockquote", { cls: c("reader-claim-quote"), text: snippet(sheet.passage.quote.exact) });
        const source = el.createDiv({ cls: c("reader-claim-field") });
        source.createSpan({ cls: c("reader-claim-label"), text: t("reader_claim_source") });
        // As it will be written (#751): the one producer of the written form.
        const entry = sourceEntry(placeOfPassage(sheet.passage), sheet.passage.bookTitle);
        source.createDiv({ cls: c("reader-claim-source"), text: entry });

        const folder = field("reader_claim_folder").createEl("input", { cls: c("reader-claim-folder"), attr: { type: "text", placeholder: t("reader_claim_folder_root"), "aria-label": t("reader_claim_folder") } });
        folder.value = lastFolder;
        this.folderSuggest(folder, (path) => (folder.value = path));

        const taken = el.createDiv({ cls: [c("reader-claim-taken"), c("reader-hidden")], attr: { "aria-live": "polite" } });
        const actions = el.createDiv({ cls: c("reader-claim-actions") });
        const cancel = actions.createEl("button", { attr: { type: "button" }, text: t("reader_hl_cancel") });
        const create = actions.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("reader_claim_create") });

        const sync = () => {
            // A blank claim has no Create (FR-4).
            create.disabled = area.value.trim().length === 0;
            if (!titled) title.value = claimTitle(area.value);
            taken.addClass(c("reader-hidden"));
        };
        area.addEventListener("input", sync);
        title.addEventListener("input", () => taken.addClass(c("reader-hidden")));
        sync();

        const run = () =>
            void this.makeClaim(sheet, { claim: area.value, title: title.value, folder: folder.value, entry }, (line, open) => {
                taken.empty();
                taken.createSpan({ text: line });
                if (open) {
                    const go = taken.createEl("button", { cls: c("reader-claim-open"), attr: { type: "button" }, text: t("reader_claim_open_it") });
                    go.addEventListener("click", () => this.view.peek(go, open, basename(open)));
                }
                taken.removeClass(c("reader-hidden"));
            });
        create.addEventListener("click", run);
        cancel.addEventListener("click", () => this.cancel());
        close.addEventListener("click", () => this.cancel());
        el.addEventListener("keydown", (event: KeyboardEvent) => {
            this.settle(sheet);
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.cancel();
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (!create.disabled) run();
            }
        });
        // Input during a move jumps it to its end (FR-15).
        el.addEventListener("pointerdown", () => this.settle(sheet));
    }

    /** Every move of the sheet, to its end. */
    private settle(sheet: Sheet): void {
        for (const move of sheet.moves.splice(0)) {
            try {
                move.finish();
            } catch {
                // Already done.
            }
        }
    }

    /** *Create*: the one note, create-only — a taken name says so and writes nothing (FR-3, FR-4). */
    private async makeClaim(sheet: Sheet, input: { claim: string; title: string; folder: string; entry: string }, say: (line: string, open?: string) => void): Promise<void> {
        const claim = input.claim.trim();
        if (!claim || sheet.busy) return;
        // A title ending in a full stop names the same note: "x." and "x" are one claim, never two files.
        const name = safeName(claimTitle(input.title) || claimTitle(claim));
        const folder = folderOf(input.folder);
        const path = `${folder ? `${folder}/` : ""}${name}.md`;
        const there = this.existing(path);
        if (there) return say(t("reader_claim_taken"), there);
        sheet.busy = true;
        const content = renderClaimNote({ claim, passage: sheet.passage.quote.exact, entry: input.entry });
        let outcome: CreateOutcome = "failed";
        let batch: string | undefined;
        try {
            outcome = await withWriteBatch({ kind: "manual", ref: "reader-claim", label: name }, async () => {
                batch = currentWriteBatch();
                const made = await this.createNote(path, content);
                // You made this claim: the §XII verdict in its most literal form — subject only, no text.
                if (made === "created") this.judgements.record({ path, subject: "reader-claim", origin: "human", verdict: "accepted" });
                return made;
            });
        } catch (error) {
            log.warn(`[Reader] a claim was not created: ${error instanceof Error ? error.name : "error"}`);
        }
        sheet.busy = false;
        if (this.sheet !== sheet) return;
        if (outcome === "taken") return say(t("reader_claim_taken"), this.existing(path) ?? path);
        if (outcome === "failed") return say(t("reader_claim_failed"));
        lastFolder = folder;
        this.fold(sheet, path, name, batch);
    }

    /** Created: the sheet folds into its row under *From this reading* (FLIP, `base`, FR-13). */
    private fold(sheet: Sheet, path: string, title: string, batch: string | undefined): void {
        this.settle(sheet);
        this.sheet = null;
        const before = rectOf(sheet.el);
        sheet.panel.removeClass(c("reader-panel--claiming"));
        const highlight = sheet.passage.highlight;
        // Taken back from its row (#454): the note to the trash, the highlight pointing at nothing again.
        const undo = batch
            ? async () => {
                  const done = await this.undo(batch);
                  if (done && highlight) this.view.unclaimed(highlight.id, path);
                  return done;
              }
            : undefined;
        this.view.addFromReading({ kind: "claim", path, title, ...(undo ? { undo } : {}) });
        if (highlight) this.view.claimed(highlight.id, path);
        const target = this.view.fromReadingBox();
        if (!target || !motionWelcome(sheet.el)) {
            sheet.el.remove();
            return;
        }
        // The row may sit below the panel's fold: brought into view first, then the sheet goes to it.
        sheet.el.parentElement?.querySelector<HTMLElement>(`.${c("reader-from-reading")}`)?.lastElementChild?.scrollIntoView?.({ block: "nearest" });
        const now = rectOf(sheet.el);
        const row = this.view.fromReadingBox() ?? target;
        const fold = sheet.el.animate(
            [
                { transform: flightTransform(now, before), opacity: 1 },
                { transform: flightTransform(now, row), opacity: 0 },
            ],
            { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }
        );
        const done = () => sheet.el.remove();
        fold.onfinish = done;
        (sheet.el.win ?? window).setTimeout(done, MOTION.base + 300);
    }

    /** *Cancel*, Esc, ✕: the sheet slides back out the way it came, the words return to the page. */
    cancel(): void {
        const sheet = this.sheet;
        if (!sheet) return;
        this.settle(sheet);
        this.sheet = null;
        const panel = sheet.panel;
        const welcome = motionWelcome(sheet.el);
        if (welcome && panel.isConnected) this.ghost(sheet.passage.quote.exact, rectOf(sheet.quote), sheet.from);
        const gone = () => {
            sheet.el.remove();
            panel.removeClass(c("reader-panel--claiming"));
        };
        // Alongside came for the sheet: it goes with it, in the same slide.
        if (sheet.opened) {
            this.view.closeAlongside();
            if (!welcome) return gone();
            (panel.win ?? window).setTimeout(gone, MOTION.base);
            return;
        }
        if (!welcome) return gone();
        const out = sheet.el.animate(this.slide(sheet, false), { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" });
        out.onfinish = gone;
        (panel.win ?? window).setTimeout(gone, MOTION.base + 300);
    }

    // ── link it to an idea ───────────────────────────────────────────────────

    /**
     * The picker for *Link to an idea* (FR-6), drawn into `container` — the popover the button was in —
     * growing from `from`. Before you type it lists what Alongside finds near the passage; it searches
     * your notes in scope. `close` takes the popover away once the picker has gone.
     */
    link(passage: VaultMovePassage & { paragraph?: string }, container: HTMLElement, from: Box, close: () => void): IdeaPicker {
        // Near the paragraph the words are in: a sentence of it may not name what the paragraph does.
        const now = this.view.nearFor(passage.paragraph?.trim() || passage.quote.exact);
        const ideas = now ? now.model.all().filter((idea) => idea.path !== passage.book) : [];
        const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, "en");
        const first: PickerChoice[] = (now?.near ?? []).map((item) => ({ value: item.path, label: item.title }));
        const offered = first.length > 0 ? first : [...ideas].sort(byTitle).map((idea) => ({ value: idea.path, label: idea.title }));
        const place = placeOfPassage(passage);
        const cites = (path: string) =>
            this.sourcesOf(path).some((value) => {
                const other = readSourceEntry(value);
                return Boolean(other?.quote && samePlace(other, place));
            });
        let busy = false;
        const claimInstead = (text?: string) => {
            const box = rectOf(picker.el);
            picker.close(close);
            this.claim(passage, box, text ? { text } : {});
        };
        const picker: IdeaPicker = mountIdeaPicker(container, {
            placeholder: t("reader_idea_picker_placeholder"),
            label: t("reader_link_list"),
            from,
            choices: (query) => {
                if (!query) return offered;
                const q = query.toLowerCase();
                return ideas
                    .filter((idea) => idea.title.toLowerCase().includes(q) || (idea.aliases ?? []).some((alias) => alias.toLowerCase().includes(q)))
                    .sort(byTitle)
                    .map((idea) => ({ value: idea.path, label: idea.title }));
            },
            // The empty states (FR-9): a vault with nothing in scope, a search with no match.
            empty: (): PickerEmpty =>
                ideas.length === 0
                    ? { text: t("reader_link_no_notes"), action: { label: t("reader_link_make_claim"), run: () => claimInstead() } }
                    : { text: t("reader_link_no_match"), action: { label: t("reader_link_make_claim"), run: (text) => claimInstead(text) } },
            onPick: (choice, row) => {
                if (busy) return;
                // Already linked (FR-7): it says so, and nothing is written.
                if (cites(choice.value)) return picker.say(t("reader_link_already"));
                busy = true;
                let batch: string | undefined;
                void withWriteBatch({ kind: "manual", ref: "reader-link", label: choice.value }, () => {
                    batch = currentWriteBatch();
                    return this.addSource(choice.value, [sourceEntry(place, passage.bookTitle)]);
                })
                    .then((added) => {
                        busy = false;
                        if (!added) return picker.say(t("reader_link_already"));
                        this.linked(choice, row ?? picker.el, batch);
                        picker.close(close);
                    })
                    .catch((error: unknown) => {
                        busy = false;
                        log.warn(`[Reader] a link was not kept: ${error instanceof Error ? error.name : "error"}`);
                        picker.say(t("reader_hl_failed"));
                    });
            },
            onCancel: () => picker.close(close),
        });
        return picker;
    }

    /** Linked: *Linked to …* under *From this reading*, the idea's name flying there (FR-8, FR-14). */
    private linked(choice: PickerChoice, row: HTMLElement, batch: string | undefined): void {
        const start = rectOf(row);
        this.view.openAlongside();
        const undo = batch ? () => this.undo(batch) : undefined;
        this.view.addFromReading({ kind: "link", path: choice.value, title: choice.label, ...(undo ? { undo } : {}) });
        const target = this.view.fromReadingBox();
        if (!target || !motionWelcome(row)) return;
        const ghost = this.view.host().createDiv({ cls: c("reader-claim-ghost"), text: choice.label, attr: { "aria-hidden": "true" } });
        fly(this.view.host(), ghost, start, target, { duration: MOTION.base });
    }
}

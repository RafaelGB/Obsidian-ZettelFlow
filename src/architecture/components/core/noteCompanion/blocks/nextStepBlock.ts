import type { App } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { STATE_LABEL_KEY, DEFAULT_STATE_PROPERTY, toDateInput } from "architecture/knowledge";
import type { Judgement, NextMoveToken, NextStepFact } from "architecture/knowledge/state";
import { UNDO_OFFER_MS } from "application/writes/undoOffer";
import { linkNotes, type LinkResult } from "architecture/plugin/services/recordedLink";
import {
    addSourceTo,
    advanceTo,
    withdrawPromotion,
    type AdvanceResult,
    type StateSettingsHost,
} from "architecture/plugin/services/noteNextStepWrites";
import { undoBatch, type UndoResult } from "architecture/plugin/writes/undoNotice";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import { InquiryNoteSuggest } from "architecture/components/core/cultivate/InquiryNoteSuggest";
import { pickMoveOn, type SayMove } from "starters/zcomponents/MoveCommandsComponent";
import { thinkAbout } from "starters/zcomponents/ThinkAboutComponent";
import { ClaimDoorModal } from "architecture/components/core/claims/ClaimDoorModal";
import { activateSurface } from "architecture/plugin";
import { flyOrigin } from "architecture/components/core/reader/openReader";
import {
    INITIAL_NEXT_UI,
    clampMove,
    closePanel,
    deepLink,
    openPanel,
    rederive,
    type NextStepUi,
} from "../nextStepUi";
import type { CompanionFocus } from "../noteCompanionContract";
import { companionMayWrite, queueCompanionWrite } from "../companionWrites";
import {
    CompanionBlock,
    marksWrite,
    noteName,
    type CompanionContext,
    type CompanionModel,
} from "./CompanionBlock";

/** The writes and the picker the card uses — injectable, so a test watches them without a vault. */
export interface NextStepDeps {
    addSourceTo: (app: App, path: string, text: string) => Promise<LinkResult>;
    linkNotes: (app: App, path: string, target: string) => Promise<LinkResult>;
    advanceTo: (app: App, host: StateSettingsHost | undefined, path: string) => Promise<AdvanceResult>;
    withdrawPromotion: (judgement: Judgement) => void;
    undoBatch: (batch: string) => Promise<UndoResult>;
    pickNote: (app: App, onPick: (path: string) => void) => void;
    /** The move picker on the note; a move that only records answers through `say` (#890). */
    pickMove: (app: App, path: string, say: SayMove) => void;
    /** Think with the note as the subject; writes nothing (#890). */
    thinkAbout: (app: App, path: string) => void;
    /** The claim box for the note — its sentence and the optional wager. */
    openClaim: (app: App, path: string) => void;
    /** Cultivate, targeted on the note. */
    cultivate: (app: App, path: string) => void;
    /** What you pressed lifts toward where it opens — one continuous shot; instant under reduced motion (§XVI). */
    flyFrom: (button: HTMLElement) => void;
}

const DEFAULT_DEPS: NextStepDeps = {
    addSourceTo,
    linkNotes,
    advanceTo,
    withdrawPromotion,
    undoBatch,
    pickNote: (app, onPick) => new InquiryNoteSuggest(app, onPick, t("note_next_choose_placeholder")).open(),
    pickMove: pickMoveOn,
    thinkAbout: (app, path) => thinkAbout({ app }, path),
    openClaim: (app, path) => {
        const file = app.vault.getFileByPath(path);
        if (file) new ClaimDoorModal(app, file).open();
    },
    cultivate: (app, path) => void activateSurface(app, "zettelflow-home", "cultivate", { target: path }),
    flyFrom: flyOrigin,
};

/** What answers a click — always about the note it was made on (`path`), never another. */
type Status = { path: string } & (
    | {
          kind: "done";
          token: NextStepFact["token"];
          text: string;
          batch?: string;
          judgement?: Judgement;
          /** The model revision the write was made against; the card waits for a newer one. */
          revision: number;
          /** Once a newer revision arrived: whether the move is still open (FR-14). */
          stillOpen?: boolean;
          at: number;
      }
    | { kind: "undone" | "undo-failed" | "failed"; at: number }
    /** A move recorded from *Make a move…*: said here, never as a toast (#546). */
    | { kind: "said"; text: string; at: number }
);

const ICON_LABEL: Record<NextStepFact["token"], Parameters<typeof t>[0]> = {
    "add-source": "note_next_do_source",
    connect: "note_next_do_connect",
    "advance-state": "note_next_do_advance",
};

function stateLabel(state: string | null | undefined): string {
    const key = state ? (STATE_LABEL_KEY as Record<string, string>)[state] : undefined;
    return key ? t(key as Parameters<typeof t>[0]) : state ?? "";
}

/**
 * **Next step** (#641): what `suggestNextMoves()` says to do with this note, finished where you are.
 *
 * One move at a time, one primary action, and *Another step* when there is more than one. Each move
 * opens an inline panel and writes only on its confirm — into the companion's note, in a batch of its
 * own — then answers on one line with an Undo for thirty seconds. No toast, no grade: the sentence
 * says the fact the move rests on, never how good the note is (D3, §XII).
 */
export class NextStepBlock extends CompanionBlock {
    readonly id = "next";
    readonly column = "main";

    private ui: NextStepUi = INITIAL_NEXT_UI;
    private status: Status | null = null;
    private path: string | null = null;
    private ctx: CompanionContext | null = null;
    private card: HTMLElement | null = null;
    private busy = false;
    /** What you have typed into the source field, kept across redraws until it is written or closed. */
    private draft = "";

    constructor(
        el: HTMLElement,
        private readonly host?: StateSettingsHost,
        private readonly deps: NextStepDeps = DEFAULT_DEPS
    ) {
        super(el);
    }

    claims(focus: CompanionFocus): boolean {
        return focus === "next";
    }

    update(ctx: CompanionContext): void {
        this.ctx = ctx;
        // A redraw while you type (a sync, another note saving) must not take the field from you.
        const typing = this.el.querySelector<HTMLInputElement>("input");
        const refocus = typing !== null && typing.ownerDocument?.activeElement === typing;
        this.beginRender();
        this.el.empty();
        this.card = null;
        if (ctx.screen.kind !== "note") return;
        const model = ctx.screen.model;

        // A different note: whatever the card said about the last one goes with it.
        if (model.path !== this.path) {
            this.path = model.path;
            this.ui = INITIAL_NEXT_UI;
            this.status = null;
            this.draft = "";
        }
        if (model.next.kind === "absent") return;

        const moves = model.next.kind === "proposing" ? model.next.moves : [];
        this.settle(model, moves);
        this.ui = clampMove(this.ui, moves.length);

        const card = this.el.createDiv({ cls: c("note-next"), attr: { role: "group", "aria-label": t("note_next_eyebrow") } });
        this.card = card;
        const head = card.createDiv({ cls: c("note-next-head") });
        head.createSpan({ cls: c("note-next-eyebrow"), text: t("note_next_eyebrow") });

        if (moves.length === 0) {
            card.createDiv({ cls: c("note-next-complete"), text: t("note_next_complete") });
            this.renderTools(card, ctx, model);
            this.renderStatus(card);
            return;
        }
        // The open steps, listed together (Q2): each says its fact and has its button; the one in
        // hand is the section's primary, and its panel opens under it.
        const list = card.createDiv({ cls: c("note-next-steps") });
        moves.forEach((move, index) => {
            const chosen = index === this.ui.index;
            const row = list.createDiv({ cls: c("note-next-step") });
            row.createDiv({ cls: c("note-next-why"), text: this.why(move) });
            const actions = row.createDiv({ cls: c("note-next-actions") });
            // One filled button in the section (AC-12): the step in hand, until its panel opens and
            // the confirm inside takes it.
            const button = actions.createEl("button", {
                cls: [
                    ...(chosen && !this.ui.open ? ["mod-cta"] : []),
                    c("note-next-step-button"),
                    ...(chosen ? [c("note-next-primary")] : []),
                ].join(" "),
                text: this.label(move),
                attr: { type: "button", "aria-expanded": String(chosen && this.ui.open) },
            });
            this.on(button, "click", () =>
                this.redraw((this.ui = chosen && this.ui.open ? closePanel(this.ui) : openPanel({ index, open: false })))
            );
            if (chosen && this.ui.open) this.renderPanel(row, ctx, model, move);
        });

        if (!this.ui.open) this.draft = "";
        this.renderTools(card, ctx, model);
        this.renderStatus(card);
        if (refocus) card.querySelector<HTMLInputElement>("input")?.focus();
    }

    reveal(focus: CompanionFocus, move?: NextMoveToken): void {
        const ctx = this.ctx;
        if (focus !== "next" || !ctx || ctx.screen.kind !== "note") return;
        const next = ctx.screen.model.next;
        this.ui = deepLink(next.kind === "proposing" ? next.moves.map((m) => m.token) : [], move);
        this.update(ctx);
        const card = this.card;
        if (!card) return;
        ctx.scrollTo(card);
        this.highlightOnce(card);
        // Straight to the first thing you would touch: the field, or the first choice.
        const panel = card.querySelector<HTMLElement>(`.${c("note-next-panel")}`);
        const first = panel?.querySelector<HTMLElement>("input") ?? panel?.querySelector<HTMLElement>("button");
        first?.focus();
    }

    /** A newer model after a write: start again on the first move, and say if this one is still open. */
    private settle(model: CompanionModel, moves: readonly NextStepFact[]): void {
        const status = this.status;
        if (!status || status.kind !== "done" || status.stillOpen !== undefined) return;
        if (model.revision <= status.revision) return;
        status.stillOpen = moves.some((move) => move.token === status.token);
        this.ui = rederive();
    }

    private why(move: NextStepFact): string {
        switch (move.token) {
            case "add-source":
                return tCount(move.unsourced, "note_next_why_source", String(move.unsourced));
            case "connect":
                return t("note_next_why_connect");
            case "advance-state":
                return t("note_next_why_advance", stateLabel(move.current));
        }
    }

    private label(move: NextStepFact): string {
        return move.token === "advance-state" ? t("note_next_do_advance", stateLabel(move.proposed)) : t(ICON_LABEL[move.token]);
    }

    private renderPanel(card: HTMLElement, ctx: CompanionContext, model: CompanionModel, move: NextStepFact): void {
        const panel = card.createDiv({ cls: c("note-next-panel") });
        const cancel = (row: HTMLElement) => {
            const button = row.createEl("button", { cls: c("note-next-cancel"), text: t("note_next_cancel"), attr: { type: "button" } });
            this.on(button, "click", () => this.redraw((this.ui = closePanel(this.ui))));
        };

        switch (move.token) {
            case "add-source": {
                panel.createEl("p", { cls: c("note-next-hint"), text: t("note_next_source_where", model.sourceKey) });
                const input = panel.createEl("input", {
                    cls: c("note-next-input"),
                    attr: { type: "text", placeholder: t("note_next_source_placeholder"), "aria-label": t("note_next_do_source") },
                });
                input.value = this.draft;
                const row = panel.createDiv({ cls: c("note-next-actions") });
                const add = row.createEl("button", { cls: "mod-cta", text: t("note_next_add"), attr: { type: "button" } });
                marksWrite(add);
                add.disabled = this.draft.trim().length === 0;
                cancel(row);
                const submit = () => {
                    const text = input.value.trim();
                    if (!text) return;
                    void this.write("add-source", t("note_next_done_source"), () => this.deps.addSourceTo(ctx.app, model.path, text));
                };
                this.on(input, "input", () => {
                    this.draft = input.value;
                    add.disabled = input.value.trim().length === 0;
                });
                this.on(input, "keydown", (event) => {
                    // Enter that ends an IME composition (CJK input) confirms the text, not the form.
                    if (event.key === "Enter" && !event.isComposing) submit();
                    if (event.key === "Escape") this.redraw((this.ui = closePanel(this.ui)));
                });
                this.on(add, "click", submit);
                return;
            }
            case "connect": {
                if (model.connect.length === 0) {
                    panel.createEl("p", { cls: c("note-next-hint"), text: t("note_next_connect_none") });
                }
                for (const row of model.connect) {
                    const line = panel.createDiv({ cls: c("note-next-candidate") });
                    this.renderName(line, ctx, row.path);
                    const link = line.createEl("button", { cls: c("note-next-pick"), text: t("note_next_link"), attr: { type: "button" } });
                    marksWrite(link);
                    this.on(link, "click", () => this.connect(ctx, model, row.path));
                }
                const row = panel.createDiv({ cls: c("note-next-actions") });
                const choose = row.createEl("button", {
                    cls: c("note-next-choose"),
                    text: t("note_next_choose_note"),
                    attr: { type: "button" },
                });
                this.on(choose, "click", () =>
                    this.deps.pickNote(ctx.app, (picked) => {
                        // Linking a note to itself, or to what it already links to, is not a step.
                        if (picked === model.path || model.linksOut.includes(picked)) return;
                        this.connect(ctx, model, picked);
                    })
                );
                cancel(row);
                return;
            }
            case "advance-state": {
                const property = this.host?.settings?.lifecycle?.stateProperty || DEFAULT_STATE_PROPERTY;
                panel.createEl("p", {
                    cls: c("note-next-hint"),
                    text: t("note_next_advance_what", property, String(move.proposed ?? "")),
                });
                const row = panel.createDiv({ cls: c("note-next-actions") });
                const confirm = row.createEl("button", { cls: "mod-cta", text: this.label(move), attr: { type: "button" } });
                marksWrite(confirm);
                cancel(row);
                this.on(confirm, "click", () =>
                    void this.write("advance-state", t("note_next_done_advance", stateLabel(move.proposed)), () =>
                        this.deps.advanceTo(ctx.app, this.host, model.path)
                    )
                );
                return;
            }
        }
    }

    /** What ZettelFlow lets you do with this note, beside its open steps — quiet, never the primary. */
    private renderTools(card: HTMLElement, ctx: CompanionContext, model: CompanionModel): void {
        // What it already claims, said as it stands: the box is where it changes, not here (Q5).
        if (model.claim) {
            card.createDiv({ cls: c("note-next-claim"), text: model.claim.text });
            if (model.claim.wager) {
                card.createDiv({ cls: c("note-next-wager"), text: t("note_next_wager_by", toDateInput(model.claim.wager.at)) });
            }
        }
        const tools = card.createDiv({ cls: c("note-next-tools") });
        const tool = (key: Parameters<typeof t>[0], run: () => void, opens = false) => {
            const button = tools.createEl("button", { cls: c("note-next-tool"), text: t(key), attr: { type: "button" } });
            this.on(button, "click", () => {
                if (opens) this.deps.flyFrom(button);
                run();
            });
        };
        tool("move_pick_title", () =>
            this.deps.pickMove(ctx.app, model.path, (text) => {
                this.status = { kind: "said", path: model.path, text, at: Date.now() };
                this.redraw();
            })
        );
        tool("command_think_about", () => this.deps.thinkAbout(ctx.app, model.path), true);
        tool(model.claim ? "note_next_edit_claim" : "claim_door_menu", () => this.deps.openClaim(ctx.app, model.path), true);
        tool("note_next_cultivate", () => this.deps.cultivate(ctx.app, model.path), true);
    }

    private connect(ctx: CompanionContext, model: CompanionModel, target: string): void {
        void this.write("connect", t("note_next_done_link", noteName(target)), () => this.deps.linkNotes(ctx.app, model.path, target));
    }

    private renderName(line: HTMLElement, ctx: CompanionContext, path: string): void {
        const name = line.createSpan({ cls: c("note-next-name"), text: noteName(path), attr: { title: path } });
        makeActivatable(name, () => ctx.open(path));
        hoverPreview(ctx.app, name, path, ctx.owner);
    }

    private async write(token: NextStepFact["token"], text: string, op: () => Promise<LinkResult | AdvanceResult>): Promise<void> {
        const ctx = this.ctx;
        if (this.busy || !ctx || ctx.screen.kind !== "note") return;
        // Outside ZettelFlow since it was drawn (#688): write nothing, and redraw it as what it is.
        if (!companionMayWrite(ctx.screen.model.path)) {
            ctx.refresh();
            return;
        }
        this.busy = true;
        // The note the write goes into: its answer belongs to it, even if you move on meanwhile.
        const path = ctx.screen.model.path;
        const revision = ctx.screen.model.revision;
        try {
            // Its turn among the companion's writes, so two never race on one note.
            const result = await queueCompanionWrite(op);
            if (!result.ok) this.status = { kind: "failed", path, at: Date.now() };
            else {
                this.status = {
                    kind: "done",
                    path,
                    token,
                    text,
                    batch: result.batch,
                    judgement: (result as AdvanceResult).judgement,
                    revision,
                    at: Date.now(),
                };
            }
            this.ui = closePanel(this.ui);
            this.draft = "";
        } catch (error) {
            log.error(`[NoteCompanion] the ${token} write failed: ${error instanceof Error ? error.message : String(error)}`);
            this.status = { kind: "failed", path, at: Date.now() };
        } finally {
            this.busy = false;
        }
        this.redraw();
    }

    private async undo(status: Extract<Status, { kind: "done" }>): Promise<void> {
        if (!status.batch || this.busy) return;
        this.busy = true;
        try {
            const batch = status.batch;
            const result = await queueCompanionWrite(() => this.deps.undoBatch(batch));
            if (result.hadWork && result.failed.length === 0) {
                if (status.judgement) this.deps.withdrawPromotion(status.judgement);
                this.status = { kind: "undone", path: status.path, at: Date.now() };
            } else {
                this.status = { kind: "undo-failed", path: status.path, at: Date.now() };
            }
        } catch (error) {
            log.error(`[NoteCompanion] undo failed: ${error instanceof Error ? error.message : String(error)}`);
            this.status = { kind: "undo-failed", path: status.path, at: Date.now() };
        } finally {
            this.busy = false;
        }
        this.redraw();
    }

    /** The one line that answers a click: what happened, and the way back for thirty seconds. */
    private renderStatus(card: HTMLElement): void {
        const status = this.status;
        // Another note on screen: the answer was about the last one, and its Undo would act on it.
        if (!status || status.path !== this.path || Date.now() - status.at >= UNDO_OFFER_MS) {
            this.status = null;
            return;
        }
        // In an idle pane nothing else would redraw it: the line goes when its window closes.
        this.later(UNDO_OFFER_MS - (Date.now() - status.at), () => this.redraw());
        const line = card.createDiv({ cls: c("note-next-status"), attr: { role: "status" } });
        if (status.kind === "said") {
            line.setText(status.text);
            return;
        }
        if (status.kind !== "done") {
            const key = {
                failed: "note_next_failed",
                undone: "note_next_undone",
                "undo-failed": "note_next_undo_failed",
            } as const;
            line.setText(t(key[status.kind]));
            return;
        }

        const said = status.stillOpen
            ? t(status.token === "add-source" ? "note_next_still_open_source" : "note_next_still_open")
            : status.text;
        line.createSpan({ text: `${said} ` });
        if (!status.batch) return;
        const undo = line.createEl("button", { cls: c("note-next-undo"), text: t("changes_undo"), attr: { type: "button" } });
        marksWrite(undo);
        this.on(undo, "click", () => {
            // One undo per offer: a double-click must not plan the same batch twice.
            undo.disabled = true;
            void this.undo(status);
        });
    }

    private redraw(_after?: unknown): void {
        if (this.ctx) this.update(this.ctx);
    }
}


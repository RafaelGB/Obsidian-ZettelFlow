import type { App } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { STATE_LABEL_KEY, DEFAULT_STATE_PROPERTY } from "architecture/knowledge";
import type { Judgement, NextMoveToken, NextStepFact } from "architecture/knowledge/state";
import { UNDO_OFFER_MS } from "application/writes/undoOffer";
import { linkNotes, type LinkResult } from "architecture/plugin/services/recordedLink";
import {
    addSourceTo,
    advanceTo,
    markExample,
    withdrawPromotion,
    type AdvanceResult,
    type StateSettingsHost,
} from "architecture/plugin/services/noteNextStepWrites";
import { undoBatch, type UndoResult } from "architecture/plugin/writes/undoNotice";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import { InquiryNoteSuggest } from "architecture/components/core/cultivate/InquiryNoteSuggest";
import {
    INITIAL_NEXT_UI,
    anotherMove,
    clampMove,
    closePanel,
    deepLink,
    openPanel,
    rederive,
    type NextStepUi,
} from "../nextStepUi";
import type { CompanionFocus } from "../noteCompanionContract";
import { CompanionBlock, noteName, type CompanionContext, type CompanionModel } from "./CompanionBlock";

/** The writes and the picker the card uses — injectable, so a test watches them without a vault. */
export interface NextStepDeps {
    addSourceTo: (app: App, path: string, text: string) => Promise<LinkResult>;
    linkNotes: (app: App, path: string, target: string) => Promise<LinkResult>;
    markExample: (app: App, path: string, target: string) => Promise<LinkResult>;
    advanceTo: (app: App, host: StateSettingsHost | undefined, path: string) => Promise<AdvanceResult>;
    withdrawPromotion: (judgement: Judgement) => void;
    undoBatch: (batch: string) => Promise<UndoResult>;
    pickNote: (app: App, onPick: (path: string) => void) => void;
}

const DEFAULT_DEPS: NextStepDeps = {
    addSourceTo,
    linkNotes,
    markExample,
    advanceTo,
    withdrawPromotion,
    undoBatch,
    pickNote: (app, onPick) => new InquiryNoteSuggest(app, onPick, t("note_next_choose_placeholder")).open(),
};

type Status =
    | {
          kind: "done";
          token: NextMoveToken;
          text: string;
          batch?: string;
          judgement?: Judgement;
          /** The model revision the write was made against; the card waits for a newer one. */
          revision: number;
          /** Once a newer revision arrived: whether the move is still open (FR-14). */
          stillOpen?: boolean;
          at: number;
      }
    | { kind: "undone" | "undo-failed" | "failed"; at: number };

const ICON_LABEL: Record<NextMoveToken, Parameters<typeof t>[0]> = {
    "add-source": "note_next_do_source",
    connect: "note_next_do_connect",
    "add-example": "note_next_do_example",
    "advance-state": "note_next_do_advance",
};

function stateLabel(state: string | null | undefined): string {
    const key = state ? (STATE_LABEL_KEY as Record<string, string>)[state] : undefined;
    return key ? t(key as Parameters<typeof t>[0]) : state ?? "";
}

function prefersReducedMotion(el: HTMLElement): boolean {
    const win = (el as HTMLElement & { win?: Window }).win ?? (typeof activeWindow === "undefined" ? undefined : activeWindow);
    return win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
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
            this.renderStatus(card);
            return;
        }
        if (moves.length > 1) {
            head.createSpan({
                cls: c("note-next-count"),
                text: t("note_next_counter", String(this.ui.index + 1), String(moves.length)),
            });
        }

        const move = moves[this.ui.index];
        card.createDiv({ cls: c("note-next-why"), text: this.why(move) });

        const actions = card.createDiv({ cls: c("note-next-actions") });
        const primary = actions.createEl("button", {
            cls: ["mod-cta", c("note-next-primary")].join(" "),
            text: this.label(move),
            attr: { type: "button", "aria-expanded": String(this.ui.open) },
        });
        this.on(primary, "click", () => this.redraw((this.ui = this.ui.open ? closePanel(this.ui) : openPanel(this.ui))));
        if (moves.length > 1) {
            const another = actions.createEl("button", {
                cls: c("note-next-another"),
                text: t("note_next_another"),
                attr: { type: "button" },
            });
            this.on(another, "click", () => this.redraw((this.ui = anotherMove(this.ui, moves.length))));
        }

        if (this.ui.open) this.renderPanel(card, ctx, model, move);
        this.renderStatus(card);
    }

    reveal(focus: CompanionFocus, move?: NextMoveToken): void {
        const ctx = this.ctx;
        if (focus !== "next" || !ctx || ctx.screen.kind !== "note") return;
        const next = ctx.screen.model.next;
        this.ui = deepLink(next.kind === "proposing" ? next.moves.map((m) => m.token) : [], move);
        this.update(ctx);
        const card = this.card;
        if (!card) return;
        card.scrollIntoView({ behavior: prefersReducedMotion(card) ? "auto" : "smooth", block: "start" });
        const highlight = c("note-companion-highlight");
        card.addClass(highlight);
        card.addEventListener("animationend", () => card.removeClass(highlight), { once: true });
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
            case "add-example":
                return t("note_next_why_example");
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
                const row = panel.createDiv({ cls: c("note-next-actions") });
                const add = row.createEl("button", { cls: "mod-cta", text: t("note_next_add"), attr: { type: "button" } });
                add.disabled = true;
                cancel(row);
                const submit = () => {
                    const text = input.value.trim();
                    if (!text) return;
                    void this.write("add-source", t("note_next_done_source"), () => this.deps.addSourceTo(ctx.app, model.path, text));
                };
                this.on(input, "input", () => (add.disabled = input.value.trim().length === 0));
                this.on(input, "keydown", (event) => {
                    if (event.key === "Enter") submit();
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
            case "add-example": {
                const seen = new Set<string>();
                for (const [labelKey, paths] of [
                    ["note_next_links_out", move.linksOut],
                    ["note_next_links_in", move.linksIn],
                ] as const) {
                    const fresh = paths.filter((path) => !seen.has(path));
                    fresh.forEach((path) => seen.add(path));
                    if (fresh.length === 0) continue;
                    panel.createDiv({ cls: c("note-next-sublabel"), text: t(labelKey) });
                    for (const path of fresh) {
                        const line = panel.createDiv({ cls: c("note-next-candidate") });
                        this.renderName(line, ctx, path);
                        const mark = line.createEl("button", { cls: c("note-next-pick"), text: t("note_next_mark_example"), attr: { type: "button" } });
                        this.on(mark, "click", () =>
                            void this.write("add-example", t("note_next_done_example", noteName(path)), () =>
                                this.deps.markExample(ctx.app, model.path, path)
                            )
                        );
                    }
                }
                cancel(panel.createDiv({ cls: c("note-next-actions") }));
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

    private connect(ctx: CompanionContext, model: CompanionModel, target: string): void {
        void this.write("connect", t("note_next_done_link", noteName(target)), () => this.deps.linkNotes(ctx.app, model.path, target));
    }

    private renderName(line: HTMLElement, ctx: CompanionContext, path: string): void {
        const name = line.createSpan({ cls: c("note-next-name"), text: noteName(path), attr: { title: path } });
        makeActivatable(name, () => ctx.open(path));
        hoverPreview(ctx.app, name, path, ctx.owner);
    }

    private async write(token: NextMoveToken, text: string, op: () => Promise<LinkResult | AdvanceResult>): Promise<void> {
        const ctx = this.ctx;
        if (this.busy || !ctx || ctx.screen.kind !== "note") return;
        this.busy = true;
        const revision = ctx.screen.model.revision;
        try {
            const result = await op();
            this.status = result.ok
                ? {
                      kind: "done",
                      token,
                      text,
                      batch: result.batch,
                      judgement: (result as AdvanceResult).judgement,
                      revision,
                      at: Date.now(),
                  }
                : { kind: "failed", at: Date.now() };
            this.ui = closePanel(this.ui);
        } finally {
            this.busy = false;
        }
        this.redraw();
    }

    private async undo(status: Extract<Status, { kind: "done" }>): Promise<void> {
        if (!status.batch) return;
        const result = await this.deps.undoBatch(status.batch);
        if (result.hadWork && result.failed.length === 0) {
            if (status.judgement) this.deps.withdrawPromotion(status.judgement);
            this.status = { kind: "undone", at: Date.now() };
        } else {
            this.status = { kind: "undo-failed", at: Date.now() };
        }
        this.redraw();
    }

    /** The one line that answers a click: what happened, and the way back for thirty seconds. */
    private renderStatus(card: HTMLElement): void {
        const status = this.status;
        if (!status || Date.now() - status.at >= UNDO_OFFER_MS) {
            this.status = null;
            return;
        }
        const line = card.createDiv({ cls: c("note-next-status"), attr: { role: "status" } });
        if (status.kind !== "done") {
            const key = { failed: "note_next_failed", undone: "note_next_undone", "undo-failed": "note_next_undo_failed" } as const;
            line.setText(t(key[status.kind]));
            return;
        }

        const said = status.stillOpen
            ? t(status.token === "add-source" ? "note_next_still_open_source" : "note_next_still_open")
            : status.text;
        line.createSpan({ text: `${said} ` });
        if (!status.batch) return;
        const undo = line.createEl("button", { cls: c("note-next-undo"), text: t("changes_undo"), attr: { type: "button" } });
        this.on(undo, "click", () => void this.undo(status));
    }

    private redraw(_after?: unknown): void {
        if (this.ctx) this.update(this.ctx);
    }
}


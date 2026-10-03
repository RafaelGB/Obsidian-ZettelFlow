import { c } from "architecture";
import { t } from "architecture/lang";
import type { CompanionSection, CompanionSectionId } from "architecture/knowledge/state";
import type { ResurfaceReason } from "application/notes/resurfaceRanking";
import { UNDO_OFFER_MS } from "application/writes/undoOffer";
import { linkNotes, type LinkResult } from "architecture/plugin/services/recordedLink";
import { undoBatch, type UndoResult } from "architecture/plugin/writes/undoNotice";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import { focusPlan } from "../companionFocus";
import type { CompanionFocus } from "../noteCompanionContract";
import { CompanionBlock, noteName, prefersReducedMotion, type CompanionContext } from "./CompanionBlock";

type LocaleKey = Parameters<typeof t>[0];

const TITLE: Record<CompanionSectionId, LocaleKey> = {
    tension: "note_companion_section_tension",
    supports: "note_companion_section_supports",
    gaps: "note_companion_section_gaps",
    nearby: "note_companion_section_nearby",
};
const NONE: Record<CompanionSectionId, LocaleKey> = {
    tension: "note_companion_none_tension",
    supports: "note_companion_none_supports",
    gaps: "note_companion_none_gaps",
    nearby: "note_companion_none_nearby",
};

/** Open on first sight: what argues with the note, what it lacks, what it forgot. */
const OPEN_BY_DEFAULT: readonly CompanionSectionId[] = ["tension", "gaps", "nearby"];

/** The two writes the block makes, injectable so a test can watch them without a vault. */
export interface SectionsDeps {
    linkNotes: (app: CompanionContext["app"], intoPath: string, target: string) => Promise<LinkResult>;
    undoBatch: (batch: string) => Promise<UndoResult>;
}

/** What answers an insert — always about the note it was made on (`path`), never another. */
type LinkStatus = { path: string; at: number } & (
    | { kind: "linked"; target: string; batch?: string }
    | { kind: "removed" }
    | { kind: "failed" }
    | { kind: "unlink-failed" }
);

/**
 * What surrounds the note (#640 FR-11..16), as one counted list of disclosures.
 *
 * It replaces two mounted panels — each with its own heading and refresh button — with one heading
 * level and none of either. Empty sections are said once, on a quiet line. The findings are the
 * evidence map's and the resurface ranking's, unchanged; only the presentation moved.
 */
export class SectionsBlock extends CompanionBlock {
    readonly id = "sections";
    readonly column = "main";

    /** What the user opened or closed; it outlives a note switch (FR-15). */
    private readonly expanded = new Set<CompanionSectionId>(OPEN_BY_DEFAULT);
    private ctx: CompanionContext | null = null;
    private status: LinkStatus | null = null;
    /** Rebuilt on every render. */
    private listHost: HTMLElement | null = null;
    /** Built once: a live region a screen reader can follow only if it is there before it speaks. */
    private statusEl: HTMLElement | null = null;
    private readonly nodes = new Map<CompanionSectionId, HTMLDetailsElement>();
    private folded: HTMLElement | null = null;
    private nonEmpty: CompanionSectionId[] = [];
    /** An undo in flight: a second click must not plan the same batch again. */
    private undoing = false;

    constructor(
        el: HTMLElement,
        private readonly deps: SectionsDeps = { linkNotes, undoBatch }
    ) {
        super(el);
    }

    update(ctx: CompanionContext): void {
        this.ctx = ctx;
        this.beginRender();
        if (!this.listHost || !this.statusEl) {
            this.el.empty();
            this.listHost = this.el.createDiv();
            this.statusEl = this.el.createDiv({ cls: c("note-companion-link-status"), attr: { role: "status" } });
        }
        this.listHost.empty();
        this.nodes.clear();
        this.folded = null;
        if (ctx.screen.kind !== "note") {
            this.renderStatus();
            return;
        }

        const { sections, folded } = ctx.screen.model.sections;
        this.nonEmpty = sections.map((section) => section.id);
        const list = this.listHost.createDiv({ cls: c("note-companion-sections") });
        for (const section of sections) this.renderSection(list, ctx, section);
        if (folded.length > 0) {
            const line = folded.map((id) => t(NONE[id])).join(" · ");
            this.folded = list.createDiv({
                cls: c("note-companion-folded"),
                text: line.charAt(0).toUpperCase() + line.slice(1),
            });
        }
        this.renderStatus();
    }

    claims(focus: CompanionFocus): boolean {
        return focus === "nearby" || focus === "gaps";
    }

    reveal(focus: CompanionFocus): void {
        const plan = focusPlan(focus, this.nonEmpty);
        if (!plan) return;
        const target = plan.expand ? this.nodes.get(plan.expand) : this.folded;
        if (!target) return;
        if (plan.expand) {
            this.expanded.add(plan.expand);
            (target as HTMLDetailsElement).open = true;
        }
        target.scrollIntoView({ behavior: prefersReducedMotion(target) ? "auto" : "smooth", block: "start" });
        // Once: the ring goes when it has played, so a second hand-over plays it again.
        this.highlightOnce(target);
    }

    private renderSection(list: HTMLElement, ctx: CompanionContext, section: CompanionSection<ResurfaceReason>): void {
        const details = list.createEl("details", {
            cls: c("note-companion-section"),
            attr: { "data-section": section.id },
        });
        details.open = this.expanded.has(section.id);
        this.on(details, "toggle", () => {
            if (details.open) this.expanded.add(section.id);
            else this.expanded.delete(section.id);
        });
        this.nodes.set(section.id, details);

        const summary = details.createEl("summary", { cls: c("note-companion-summary") });
        summary.createSpan({ cls: c("note-companion-summary-title"), text: t(TITLE[section.id]) });
        summary.createSpan({ cls: c("note-companion-summary-count"), text: ` · ${section.count}` });

        const body = details.createDiv({ cls: c("note-companion-section-body") });
        switch (section.id) {
            case "tension":
                for (const path of section.notes) this.renderNote(body, ctx, path);
                break;
            case "supports":
                for (const path of section.notes) this.renderNote(body, ctx, path);
                if (section.evidence.length > 0) {
                    body.createDiv({ cls: c("note-companion-sublabel"), text: t("evidence_map_evidence_heading") });
                    for (const entry of section.evidence) {
                        const row = body.createDiv({ cls: c("note-companion-claim") });
                        row.createSpan({ text: entry.claim });
                        row.createSpan({ cls: c("note-companion-row-reason"), text: ` · ${entry.source.ref}` });
                    }
                }
                break;
            case "gaps":
                if (section.unsourcedClaims.length > 0) {
                    body.createDiv({ cls: c("note-companion-sublabel"), text: t("evidence_map_unsourced_claims_label") });
                    for (const claim of section.unsourcedClaims) {
                        body.createDiv({ cls: c("note-companion-claim"), text: claim.claim });
                    }
                }
                if (section.openQuestions.length > 0) {
                    body.createDiv({ cls: c("note-companion-sublabel"), text: t("evidence_map_open_questions_label") });
                    for (const path of section.openQuestions) this.renderNote(body, ctx, path);
                }
                break;
            case "nearby":
                for (const row of section.rows) {
                    const line = this.renderNote(body, ctx, row.path, this.reasonText(row.reasons));
                    const insert = line.createEl("button", {
                        cls: c("note-companion-insert"),
                        text: t("resurface_insert_link"),
                        attr: { type: "button" },
                    });
                    this.on(insert, "click", () => {
                        // One click, one link: a double-click must not append it twice.
                        insert.disabled = true;
                        void this.insertLink(ctx, row.path);
                    });
                }
                break;
        }
    }

    private renderNote(body: HTMLElement, ctx: CompanionContext, path: string, reason?: string): HTMLElement {
        const row = body.createDiv({ cls: c("note-companion-row") });
        const main = row.createDiv({ cls: c("note-companion-row-main") });
        const name = main.createSpan({ cls: c("note-companion-row-name"), text: noteName(path), attr: { title: path } });
        makeActivatable(name, () => ctx.open(path));
        hoverPreview(ctx.app, name, path, ctx.owner);
        if (reason) main.createSpan({ cls: c("note-companion-row-reason"), text: reason });
        return row;
    }

    /** Into the companion's note, never the editor with the cursor (amendment 2). */
    private async insertLink(ctx: CompanionContext, targetPath: string): Promise<void> {
        if (ctx.screen.kind !== "note") return;
        // The note the link goes into: the answer belongs to it, even if you move on meanwhile.
        const path = ctx.screen.model.path;
        const result = await this.deps.linkNotes(ctx.app, path, targetPath);
        this.status = result.ok
            ? { kind: "linked", path, target: noteName(targetPath), batch: result.batch, at: Date.now() }
            : { kind: "failed", path, at: Date.now() };
        this.redraw();
    }

    private async undo(path: string, batch: string): Promise<void> {
        if (this.undoing) return;
        this.undoing = true;
        let result: UndoResult;
        try {
            result = await this.deps.undoBatch(batch);
        } catch {
            result = { hadWork: true, done: 0, failed: [batch] };
        } finally {
            this.undoing = false;
        }
        // Say what happened, not what was hoped: an undo with nothing left to take back, or one
        // that failed, does not get to say the link is gone.
        this.status =
            result.hadWork && result.failed.length === 0
                ? { kind: "removed", path, at: Date.now() }
                : { kind: "unlink-failed", path, at: Date.now() };
        this.redraw();
    }

    private redraw(): void {
        if (this.ctx) this.update(this.ctx);
    }

    /** The one line that answers an insert: what happened, and the way back for thirty seconds. */
    private renderStatus(): void {
        const line = this.statusEl;
        if (!line) return;
        line.empty();
        const status = this.status;
        const shown = this.ctx?.screen.kind === "note" ? this.ctx.screen.model.path : null;
        // Another note on screen: the answer was about the last one, and its Undo would act on it.
        if (!status || status.path !== shown || Date.now() - status.at >= UNDO_OFFER_MS) {
            this.status = null;
            return;
        }
        // In an idle pane nothing else would redraw it: the line goes when its window closes.
        this.later(UNDO_OFFER_MS - (Date.now() - status.at), () => this.redraw());
        if (status.kind !== "linked") {
            const key = { failed: "note_companion_link_failed", removed: "note_companion_link_removed", "unlink-failed": "note_companion_unlink_failed" } as const;
            line.setText(t(key[status.kind]));
            return;
        }
        line.createSpan({ text: `${t("note_companion_linked", status.target)} ` });
        // No undo when the link shared a batch with another write in flight (see linkNotes).
        const batch = status.batch;
        if (!batch) return;
        const undo = line.createEl("button", {
            cls: c("note-companion-undo"),
            text: t("changes_undo"),
            attr: { type: "button" },
        });
        this.on(undo, "click", () => {
            // One undo per offer: a double-click must not plan the same batch twice.
            undo.disabled = true;
            void this.undo(status.path, batch);
        });
    }

    private reasonText(reasons: readonly ResurfaceReason[]): string {
        return reasons
            .map((reason) => {
                if (reason.kind === "tag") {
                    const tags = reason.shared.map((tag) => `#${tag}`).join(", ");
                    return reason.shared.length > 1 ? t("resurface_reason_tags", tags) : t("resurface_reason_tag", tags);
                }
                if (reason.kind === "backlink") return t("resurface_reason_backlink");
                return reason.shared.length > 0 ? t("resurface_reason_shared_link") : t("resurface_reason_link");
            })
            .join(" · ");
    }
}

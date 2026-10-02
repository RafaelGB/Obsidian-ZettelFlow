import { setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { hoverPreview } from "architecture/components/core/a11y";
import type { LifecycleStep, NoteVitals } from "architecture/knowledge/state";
import { CompanionBlock, noteName, type CompanionContext } from "./CompanionBlock";


/**
 * The companion's head (#640 FR-6..10): which note, where it stands, four counts.
 *
 * It stays on screen while the rest scrolls, so it carries the view's only two controls — pin and
 * refresh. Nothing in it grades the note: a zero is drawn faint, never in a warning colour, and the
 * stepper says where the note is without offering to move it (that is the next step's job, #641).
 */
export class HeadBlock extends CompanionBlock {
    readonly id = "head";
    readonly column = "head";

    update(ctx: CompanionContext): void {
        this.beginRender();
        this.el.empty();
        const head = this.el.createDiv({ cls: c("note-companion-head") });
        const screen = ctx.screen;

        if (screen.kind === "empty") {
            this.renderEmpty(head, ctx, screen.last);
            return;
        }

        const path = screen.kind === "note" ? screen.model.path : screen.path;
        this.renderTitle(head, ctx, screen.kind === "note" ? screen.model.title : noteName(path), path);
        if (ctx.pinned) this.renderPinned(head, ctx);

        if (screen.kind === "indexing" || screen.kind === "error") {
            head.createDiv({
                cls: c("note-companion-status"),
                text: t(screen.kind === "indexing" ? "note_companion_indexing" : "note_companion_error"),
            });
            return;
        }
        this.renderStepper(head, screen.model.steps);
        this.renderVitals(head, ctx, screen.model.vitals);
    }

    private renderTitle(head: HTMLElement, ctx: CompanionContext, title: string, path: string): void {
        const row = head.createDiv({ cls: c("note-companion-title-row") });
        row.createDiv({ cls: c("note-companion-title"), text: title, attr: { title: path } });

        const pin = row.createEl("button", {
            cls: [c("note-companion-pin"), "clickable-icon", ...(ctx.pinned ? ["is-active"] : [])].join(" "),
            attr: {
                type: "button",
                "aria-label": t("note_companion_pin"),
                "aria-pressed": String(ctx.pinned),
            },
        });
        setIcon(pin, "pin");
        this.on(pin, "click", () => (ctx.pinned ? ctx.follow() : ctx.pin()));

        const refresh = row.createEl("button", {
            cls: [c("note-companion-refresh"), "clickable-icon"].join(" "),
            attr: { type: "button", "aria-label": t("note_companion_refresh") },
        });
        setIcon(refresh, "refresh-cw");
        this.on(refresh, "click", () => ctx.refresh());
    }

    private renderPinned(head: HTMLElement, ctx: CompanionContext): void {
        const banner = head.createDiv({ cls: c("note-companion-pinned") });
        banner.createSpan({ text: t("note_companion_pinned") });
        const follow = banner.createEl("button", {
            cls: c("note-companion-follow"),
            text: t("note_companion_follow_active"),
            attr: { type: "button" },
        });
        this.on(follow, "click", () => ctx.follow());
    }

    private renderStepper(head: HTMLElement, steps: LifecycleStep[]): void {
        const list = head.createEl("ol", {
            cls: c("note-companion-stepper"),
            attr: { "aria-label": t("note_companion_stepper_label") },
        });
        for (const step of steps) {
            const item = list.createEl("li", {
                cls: [c("note-companion-step"), c(`note-companion-step--${step.status}`)].join(" "),
            });
            if (step.status === "current") item.setAttribute("aria-current", "step");
            item.createSpan({ cls: c("note-companion-step-dot") });
            item.createSpan({ cls: c("note-companion-step-label"), text: t(step.labelKey) });
        }
        // A note that never stated a state is not "fleeting" — it is unstated, and says so.
        if (!steps.some((step) => step.status !== "todo")) {
            head.createDiv({ cls: c("note-companion-no-state"), text: t("note_companion_no_state") });
        }
    }

    private renderVitals(head: HTMLElement, ctx: CompanionContext, vitals: NoteVitals): void {
        const row = head.createDiv({
            cls: c("note-companion-vitals"),
            attr: { role: "group", "aria-label": t("note_companion_vitals_label") },
        });
        const cls = (count: number) =>
            [c("note-companion-vital"), ...(count === 0 ? [c("note-companion-vital--zero")] : [])].join(" ");

        // Links in/out are plain counts until the neighbourhood exists to show them (#643).
        row.createSpan({ cls: cls(vitals.linksIn), text: tCount(vitals.linksIn, "note_companion_links_in", String(vitals.linksIn)) });
        row.createSpan({ cls: cls(vitals.linksOut), text: tCount(vitals.linksOut, "note_companion_links_out", String(vitals.linksOut)) });

        // Claims and sources are read in the gaps — the claims without a source are listed there.
        for (const [count, key] of [
            [vitals.claims, "note_companion_claims"],
            [vitals.sources, "note_companion_sources"],
        ] as const) {
            const button = row.createEl("button", {
                cls: cls(count),
                text: tCount(count, key, String(count)),
                attr: { type: "button" },
            });
            this.on(button, "click", () => ctx.reveal("gaps"));
        }
    }

    private renderEmpty(head: HTMLElement, ctx: CompanionContext, last: string | null): void {
        const empty = head.createDiv({ cls: c("note-companion-empty") });
        empty.createDiv({ text: t("note_companion_empty") });
        if (!last) return;
        const line = empty.createDiv({ cls: c("note-companion-last-line") });
        line.createSpan({ text: `${t("note_companion_last_note")}: ` });
        const link = line.createEl("button", {
            cls: c("note-companion-last"),
            text: noteName(last),
            attr: { type: "button", title: last },
        });
        this.on(link, "click", () => ctx.open(last));
        hoverPreview(ctx.app, link, last, ctx.owner);
    }
}

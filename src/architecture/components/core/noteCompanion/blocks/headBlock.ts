import { Menu, setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { STATE_EMOJI } from "architecture/knowledge";
import { hoverPreview } from "architecture/components/core/a11y";
import type { HeaderAction } from "architecture/components/core/surface/ModeHeader";
import { ReasoningPathsModal } from "zettelkasten/modals/ReasoningPathsModal";
import type { LifecycleStep, NoteVitals } from "architecture/knowledge/state";
import { CompanionBlock, noteName, type CompanionContext, type CompanionModel } from "./CompanionBlock";

/** The state the card would move the note to, when advancing is one of its moves. */
function proposedStep(model: CompanionModel): string | null {
    if (model.next.kind !== "proposing") return null;
    const advance = model.next.moves.find((move) => move.token === "advance-state");
    return advance && advance.token === "advance-state" ? advance.proposed : null;
}


/**
 * The companion's head (#640 FR-6..10): which note, where it stands, four counts.
 *
 * It stays on screen while the rest scrolls, so it carries the view's only two controls — pin and
 * refresh. Nothing in it grades the note: a zero is drawn faint, never in a warning colour, and the
 * stepper says where the note is. Its next step is a control only when the next-step card proposes
 * advancing, and it opens the card's confirm rather than writing anything itself (#641).
 */
export class HeadBlock extends CompanionBlock {
    readonly id = "head";
    readonly column = "head";

    private ctx: CompanionContext | null = null;

    /**
     * *Trace reasoning paths* from the companion's note (#578 → #642). The command traces the
     * active file, which is the wrong note while the companion is pinned — so the menu opens the
     * modal on this note directly.
     */
    menuItems(): HeaderAction[] {
        const ctx = this.ctx;
        if (!ctx || ctx.screen.kind !== "note") return [];
        const path = ctx.screen.model.path;
        return [
            {
                label: t("note_companion_trace"),
                icon: "route",
                onClick: () => new ReasoningPathsModal(ctx.app, path).open(),
            },
        ];
    }

    update(ctx: CompanionContext): void {
        this.ctx = ctx;
        this.beginRender();
        this.el.empty();
        const head = this.el.createDiv({ cls: c("note-companion-head") });
        const screen = ctx.screen;

        if (screen.kind === "empty") {
            this.renderEmpty(head, ctx, screen.last);
            return;
        }

        const path = screen.kind === "note" ? screen.model.path : screen.path;
        this.renderTitle(head, ctx, screen.kind === "note" ? screen.model.title : noteName(path), path, screen.kind === "note");
        if (ctx.pinned) this.renderPinned(head, ctx);

        if (screen.kind === "indexing" || screen.kind === "error") {
            head.createDiv({
                cls: c("note-companion-status"),
                text: t(screen.kind === "indexing" ? "note_companion_indexing" : "note_companion_error"),
            });
            return;
        }
        this.renderStepper(head, ctx, screen.model.steps, proposedStep(screen.model));
        this.renderVitals(head, ctx, screen.model.vitals);
    }

    private renderTitle(head: HTMLElement, ctx: CompanionContext, title: string, path: string, withMenu: boolean): void {
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

        // The ⋯ overflow (#642): what you can do *with* this note, read when it opens — the
        // story's share depends on what the story holds at that moment.
        if (!withMenu) return;
        const more = row.createEl("button", {
            cls: [c("note-companion-more"), "clickable-icon"].join(" "),
            attr: { type: "button", "aria-label": t("mode_header_more"), "aria-haspopup": "menu" },
        });
        setIcon(more, "more-horizontal");
        this.on(more, "click", () => {
            const menu = new Menu();
            for (const action of ctx.menu()) {
                menu.addItem((item) => item.setTitle(action.label).setIcon(action.icon).onClick(action.onClick));
            }
            // From the button's own corner, so the keyboard opens it where the control is.
            const box = more.getBoundingClientRect();
            // In the window the button is in: a companion in a popout opens its menu there.
            menu.showAtPosition({ x: box.left, y: box.bottom }, more.doc);
        });
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

    private renderStepper(head: HTMLElement, ctx: CompanionContext, steps: LifecycleStep[], proposed: string | null): void {
        const list = head.createEl("ol", {
            cls: c("note-companion-stepper"),
            attr: { "aria-label": t("note_companion_stepper_label") },
        });
        for (const step of steps) {
            const item = list.createEl("li", {
                cls: [c("note-companion-step"), c(`note-companion-step--${step.status}`)].join(" "),
            });
            if (step.status === "current") item.setAttribute("aria-current", "step");
            // The one step you can take from here, when the next-step card proposes it (FR-15): the
            // same confirm as the card's, never a write of its own.
            const host =
                step.state === proposed
                    ? item.createEl("button", {
                          cls: c("note-companion-step-next"),
                          attr: { type: "button", "aria-label": t("note_next_do_advance", t(step.labelKey)) },
                      })
                    : item;
            if (host !== item) this.on(host, "click", () => ctx.reveal("next", "advance-state"));
            host.createSpan({ cls: c("note-companion-step-dot") });
            // Where the note is now reads at a glance: the current step is a filled pill with the
            // state's own emoji, the way the state chip draws it everywhere else (#639 walk).
            const label = step.status === "current" ? `${STATE_EMOJI[step.state]} ${t(step.labelKey)}` : t(step.labelKey);
            host.createSpan({ cls: c("note-companion-step-label"), text: label });
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

        // Each count opens where it is read: the links in the neighbourhood's list (#643), claims
        // and sources in the gaps — the claims without a source are listed there.
        for (const [count, key, focus] of [
            [vitals.linksIn, "note_companion_links_in", "links-in"],
            [vitals.linksOut, "note_companion_links_out", "links-out"],
            [vitals.claims, "note_companion_claims", "gaps"],
            [vitals.sources, "note_companion_sources", "gaps"],
        ] as const) {
            const button = row.createEl("button", {
                cls: cls(count),
                text: tCount(count, key, String(count)),
                attr: { type: "button" },
            });
            this.on(button, "click", () => ctx.reveal(focus));
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

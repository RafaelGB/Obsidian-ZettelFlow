import { setIcon, type App } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { projectStory, type StoryFilter, type TimelineEvent } from "architecture/knowledge/state";
import type { HeaderAction } from "architecture/components/core/surface/ModeHeader";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { readStory, type StoryStrands } from "../storySource";
import { shareIdeaCard } from "../shareIdeaCard";
import { renderEvent, STORY_ICON, type RowContext } from "../storyRows";
import { absoluteDay, monthHeading } from "../storyFormat";
import { CompanionBlock, type CompanionContext } from "./CompanionBlock";

type LocaleKey = Parameters<typeof t>[0];

const CHIP_LABEL: Record<StoryFilter, LocaleKey> = {
    all: "note_story_chip_all",
    decisions: "note_story_chip_decisions",
    moves: "note_story_chip_moves",
    thoughts: "note_story_chip_thoughts",
};

/** How the block reads its strands and the time — injectable, so a test needs no vault and no clock. */
export interface StoryDeps {
    read: (app: App, path: string) => StoryStrands;
    now: () => number;
    forget: (moveId: string) => void;
    share: (app: App, path: string, events: readonly TimelineEvent[]) => Promise<void>;
}

const DEFAULT_DEPS: StoryDeps = {
    read: readStory,
    now: () => Date.now(),
    forget: (id) => MoveLog.getInstance().remove(id),
    share: shareIdeaCard,
};

/**
 * **The note's story** (#642, epic #639) — how the note got here, told as one rail.
 *
 * Newest first, under month headings; one icon per kind of event and the accent on what you
 * decided; relative dates with the day itself on hover; a run of unchanged snapshots folded to one
 * row; chips to read only your decisions, moves or thoughts; and the day you expect to know by
 * pinned above it all while it is still ahead. It replaces the evolution timeline's own view, its
 * refresh and its "only my judgements" toggle. It writes nothing; *Forget this move* touches the
 * move log and nothing else.
 */
export class StoryBlock extends CompanionBlock {
    readonly id = "story";
    readonly column = "side";

    private ctx: CompanionContext | null = null;
    private path: string | null = null;
    private filter: StoryFilter = "all";
    private readonly expanded = new Set<number>();
    private strands: StoryStrands | null = null;
    private failed = false;

    constructor(
        el: HTMLElement,
        private readonly deps: StoryDeps = DEFAULT_DEPS
    ) {
        super(el);
    }

    update(ctx: CompanionContext): void {
        this.ctx = ctx;
        if (ctx.screen.kind !== "note") {
            this.beginRender();
            this.el.empty();
            this.path = null;
            this.strands = null;
            return;
        }
        const path = ctx.screen.model.path;
        // Another note is another story: back to All, every run folded again (FR-7).
        if (path !== this.path) {
            this.path = path;
            this.filter = "all";
            this.expanded.clear();
        }
        this.readStrands();
        this.draw();
    }

    /** *Share this idea* — only when there is a story to share (FR-20). */
    menuItems(): HeaderAction[] {
        const ctx = this.ctx;
        const path = this.path;
        const events = this.strands?.events ?? [];
        if (!ctx || !path || events.length === 0) return [];
        return [
            {
                label: t("evolution_timeline_share_button"),
                icon: "image",
                onClick: () => void this.deps.share(ctx.app, path, events),
            },
        ];
    }

    private readStrands(): void {
        if (!this.ctx || !this.path) return;
        try {
            this.strands = this.deps.read(this.ctx.app, this.path);
            this.failed = false;
        } catch (error) {
            this.strands = null;
            this.failed = true;
            log.error(`[NoteStory] could not read the story of ${this.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private draw(): void {
        const ctx = this.ctx;
        this.beginRender();
        this.el.empty();
        if (!ctx) return;
        const root = this.el.createDiv({ cls: c("note-story") });
        root.createDiv({ cls: c("note-story-title"), text: t("note_story_title") });

        if (this.failed || !this.strands) {
            root.createDiv({ cls: c("note-story-status"), text: t("evolution_timeline_error") });
            return;
        }
        const { events, historyKept } = this.strands;
        const now = this.deps.now();

        // Once, at the top. A sentence repeated on every row is a reproach (FR-15).
        if (!historyKept) root.createDiv({ cls: c("note-story-not-kept"), text: t("note_story_not_kept") });

        let story = projectStory(events, { now, filter: this.filter, expanded: this.expanded });
        // A chip that has emptied (the last move forgotten) has nothing to show: back to All.
        if (this.filter !== "all" && !story.chips.some((chip) => chip.id === this.filter)) {
            this.filter = "all";
            story = projectStory(events, { now, filter: this.filter, expanded: this.expanded });
        }
        if (story.pinned) {
            // The one event that has not happened: an absolute day, no countdown, no colour that
            // changes with distance (FR-12/13, #572).
            const card = root.createDiv({ cls: c("note-story-pinned") });
            const icon = card.createSpan({ cls: c("note-story-icon"), attr: { "aria-hidden": "true" } });
            setIcon(icon, STORY_ICON.horizon);
            const text = card.createDiv({ cls: c("note-story-pinned-body") });
            text.createDiv({ cls: c("note-story-pinned-day"), text: t("note_story_horizon", absoluteDay(story.pinned.at)) });
            text.createDiv({ cls: c("note-story-claim"), text: story.pinned.expectation });
        }

        if (events.length === 0) {
            root.createDiv({ cls: c("note-story-empty"), text: t("note_story_empty") });
            return;
        }

        if (story.chips.length > 0) this.renderChips(root, story.chips);

        const rows: RowContext = {
            app: ctx.app,
            owner: ctx.owner,
            now,
            on: (el, type, handler) => this.on(el, type, handler),
            forget: (move) => {
                // The log, and nothing else — never the note the move was about (FR-18).
                this.deps.forget(move.id);
                this.readStrands();
                this.draw();
            },
        };
        for (const group of story.groups) {
            root.createDiv({ cls: c("note-story-month"), text: monthHeading(group.year, group.month0) });
            const list = root.createEl("ol", { cls: c("note-story-rail") });
            for (const row of group.rows) {
                if (row.kind === "event") {
                    renderEvent(list, row.event, rows);
                    continue;
                }
                const item = list.createEl("li", { cls: c("note-story-fold-row") });
                const more = item.createEl("button", {
                    cls: c("note-story-fold"),
                    text: tCount(row.hidden, "note_story_more_snapshots", String(row.hidden)),
                    attr: { type: "button" },
                });
                this.on(more, "click", () => {
                    this.expanded.add(row.key);
                    this.draw();
                });
            }
        }
    }

    private renderChips(root: HTMLElement, chips: { id: Exclude<StoryFilter, "all">; count: number }[]): void {
        const bar = root.createDiv({
            cls: c("note-story-chips"),
            attr: { role: "group", "aria-label": t("note_story_filter_label") },
        });
        const options: { id: StoryFilter; count?: number }[] = [{ id: "all" }, ...chips];
        for (const option of options) {
            const active = option.id === this.filter;
            const chip = bar.createEl("button", {
                cls: [c("note-story-chip"), ...(active ? [c("note-story-chip--active")] : [])].join(" "),
                attr: { type: "button", "aria-pressed": String(active) },
            });
            chip.createSpan({ text: t(CHIP_LABEL[option.id]) });
            if (option.count !== undefined) chip.createSpan({ cls: c("note-story-chip-count"), text: String(option.count) });
            this.on(chip, "click", () => {
                this.filter = option.id;
                this.draw();
            });
        }
    }
}

import { ItemView, TFile, type TAbstractFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { CompanionBlock, type CompanionContext, type CompanionScreen } from "./blocks/CompanionBlock";
import { HeadBlock } from "./blocks/headBlock";
import { SectionsBlock } from "./blocks/sectionsBlock";
import { NextStepBlock } from "./blocks/nextStepBlock";
import { NeighbourhoodBlock } from "./blocks/neighbourhoodBlock";
import type { StateSettingsHost } from "architecture/plugin/services/noteNextStepWrites";

/** What the view reads and remembers through the plugin it is handed. */
export interface CompanionHost extends StateSettingsHost {
    settings?: StateSettingsHost["settings"] & { noteNeighbourhoodView?: "graph" | "list" };
    saveSettings?(): Promise<void>;
}
import { StoryBlock } from "./blocks/storyBlock";
import { buildCompanionScreen } from "./companionModel";
import { INITIAL_SUBJECT, reduceSubject, type SubjectEvent, type SubjectState } from "./companionSubject";
import { NOTE_COMPANION_VIEW, parseCompanionState, type NoteCompanionState } from "./noteCompanionContract";

const DEBOUNCE_MS = 400;

/**
 * **This note** (#640, epic #639) — the note you are reading, seen from the right sidebar: where it
 * stands, what surrounds it, how it got here.
 *
 * Its own view, not a mode of a surface: a per-note companion has to stay docked beside the editor
 * and follow it, the way Backlinks and Outline do, and a mode inside a main-area tab could do
 * neither. The view owns the listeners, the pin and the one refresh; what is drawn belongs to the
 * blocks, which later slices extend (next step #641, story #642, neighbourhood #643).
 */
export class NoteCompanionView extends ItemView {
    private subject: SubjectState = INITIAL_SUBJECT;
    private blocks: CompanionBlock[] = [];
    private columns: Record<CompanionBlock["column"], HTMLElement> | null = null;
    /** A hand-over waiting for the next render — consumed once, never persisted. */
    private pending: Pick<NoteCompanionState, "focus" | "move"> | null = null;
    private debounceTimer: number | undefined;
    /** A refresh skipped while the view was hidden, owed for when it is shown again. */
    private stale = false;

    /**
     * @param plugin injected, never looked up: during load `getOwnPlugin()` is not there yet (#374).
     * The next-step card reads where the lifecycle state lives from its settings.
     */
    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin?: CompanionHost
    ) {
        super(leaf);
    }

    /** A literal: `ItemView` calls this from its own constructor, before any field exists (#278). */
    getViewType(): string {
        return "zettelflow-note";
    }

    getDisplayText(): string {
        return t("note_companion_title");
    }

    getIcon(): string {
        return "file-search";
    }

    async onOpen(): Promise<void> {
        this.buildShell();
        this.registerEvent(this.app.workspace.on("file-open", (file) => this.dispatch(this.activeEvent(file))));
        this.registerEvent(this.app.metadataCache.on("resolved", () => this.schedule()));
        this.registerEvent(
            this.app.vault.on("rename", (file: TAbstractFile, from: string) => {
                this.dispatch({ kind: "rename", from, to: file.path }, false);
                this.schedule();
            })
        );
        this.registerEvent(
            this.app.vault.on("delete", (file: TAbstractFile) => {
                this.dispatch({ kind: "delete", path: file.path, active: this.activeMarkdown() }, false);
                this.schedule();
            })
        );
        // Hidden behind another tab or in a collapsed sidebar, the view skips its work and owes it.
        this.registerEvent(this.app.workspace.on("layout-change", () => this.catchUp()));
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.catchUp()));
        // The index builds when the layout is ready; a warm cache may have fired "resolved" before
        // that, so ask again once it has — otherwise a restored view would say "indexing" until you
        // switched notes. Registered after the index's own callback, so it runs after the build.
        this.app.workspace.onLayoutReady(() => this.schedule());
        // A restored pin keeps its note; otherwise start on whatever note is in front of you.
        if (!this.subject.pinned) this.subject = reduceSubject(this.subject, this.activeEvent(this.app.workspace.getActiveFile()));
        this.render();
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.debounceTimer);
        for (const block of this.blocks) this.removeChild(block);
        this.blocks = [];
        this.columns = null;
        this.contentEl.empty();
    }

    /** Only a pin outlives a restart; a followed note is whatever is active next time. */
    getState(): Record<string, unknown> {
        const state = super.getState();
        return this.subject.pinned && this.subject.shown ? { ...state, path: this.subject.shown, pinned: true } : state;
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const request = parseCompanionState(state);
        if (request.path) {
            this.subject = reduceSubject(this.subject, { kind: "open", path: request.path });
            if (request.pinned) this.subject = reduceSubject(this.subject, { kind: "pin" });
        }
        // A deep link can unpin, too.
        if (request.pinned === false && this.subject.pinned) {
            this.subject = reduceSubject(this.subject, { kind: "follow", active: this.activeMarkdown() });
        }
        if (request.focus) this.pending = { focus: request.focus, move: request.move };
        if (this.columns) this.render();
    }

    private buildShell(): void {
        this.contentEl.empty();
        const root = this.contentEl.createDiv({ cls: c("note-companion") });
        const head = root.createDiv({ cls: c("note-companion-col-head") });
        const body = root.createDiv({ cls: c("note-companion-body") });
        this.columns = {
            head,
            main: body.createDiv({ cls: c("note-companion-col-main") }),
            side: body.createDiv({ cls: c("note-companion-col-side") }),
        };
        const columns = this.columns;
        this.blocks = [
            new HeadBlock(columns.head.createDiv()),
            // Order is the reading order: what to do, then what surrounds it (#639).
            new NextStepBlock(columns.main.createDiv(), this.plugin),
            new NeighbourhoodBlock(columns.main.createDiv()),
            new SectionsBlock(columns.main.createDiv()),
            // The story starts at the top of the right column when the pane is wide (#642).
            new StoryBlock(columns.side.createDiv()),
        ].map((block) => this.addChild(block));
    }

    private activeEvent(file: TFile | null): SubjectEvent {
        return { kind: "active", path: file?.path ?? null, markdown: file instanceof TFile && file.extension === "md" };
    }

    private activeMarkdown(): string | null {
        const file = this.app.workspace.getActiveFile();
        return file instanceof TFile && file.extension === "md" ? file.path : null;
    }

    private dispatch(event: SubjectEvent, renderNow = true): void {
        const next = reduceSubject(this.subject, event);
        if (next === this.subject) return;
        const pinChanged = next.pinned !== this.subject.pinned || (next.pinned && next.shown !== this.subject.shown);
        this.subject = next;
        if (pinChanged) this.app.workspace.requestSaveLayout();
        if (renderNow) this.render();
    }

    private schedule(): void {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => this.render(), DEBOUNCE_MS);
    }

    /** Whether anyone can see the view. The vault-wide ranking is not worth running for nobody. */
    private visible(): boolean {
        const el = this.containerEl as HTMLElement & { isShown?: () => boolean };
        return typeof el?.isShown !== "function" || el.isShown();
    }

    private catchUp(): void {
        if (this.stale && this.visible()) this.render();
    }

    /** Remember graph or list across notes, panes and restarts (#643 FR-11). */
    private setNeighbourhoodView(view: "graph" | "list"): void {
        const settings = this.plugin?.settings;
        if (!settings || settings.noteNeighbourhoodView === view) return;
        settings.noteNeighbourhoodView = view;
        void this.plugin?.saveSettings?.();
    }

    /** The head's ⋯ menu: what every block offers right now, in block order (#642). */
    private menuItems(): ReturnType<CompanionBlock["menuItems"]> {
        return this.blocks.flatMap((block) => block.menuItems());
    }

    private render(): void {
        if (!this.columns) return;
        window.clearTimeout(this.debounceTimer);
        // A hand-over always renders: it is how the view was just revealed.
        if (!this.visible() && !this.pending) {
            this.stale = true;
            return;
        }
        this.stale = false;
        const screen: CompanionScreen = buildCompanionScreen(this.app, this.subject);
        const pending = this.pending;
        this.pending = null;
        const ctx: CompanionContext = {
            app: this.app,
            screen,
            pinned: this.subject.pinned,
            owner: this,
            pin: () => this.dispatch({ kind: "pin" }),
            follow: () => this.dispatch({ kind: "follow", active: this.activeMarkdown() }),
            refresh: () => this.render(),
            reveal: (focus, move) => this.blocks.find((block) => block.claims(focus))?.reveal(focus, move),
            open: (path, newLeaf) =>
                void this.app.workspace.openLinkText(path, screen.kind === "note" ? screen.model.path : "", newLeaf ?? false),
            neighbourhoodView: this.plugin?.settings?.noteNeighbourhoodView ?? "graph",
            setNeighbourhoodView: (view) => this.setNeighbourhoodView(view),
            menu: () => this.menuItems(),
        };
        for (const block of this.blocks) block.update(ctx);

        if (pending?.focus) {
            const owner = this.blocks.find((block) => block.claims(pending.focus!));
            if (owner) owner.reveal(pending.focus, pending.move);
            else log.debug(`[NoteCompanion] nothing here handles focus "${pending.focus}" yet`);
        }
    }
}

export { NOTE_COMPANION_VIEW };

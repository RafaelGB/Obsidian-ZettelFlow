import { ItemView, WorkspaceLeaf } from "obsidian";
import { LEGACY_VIEW_TARGETS, isViewTarget } from "./legacyTargets";
import { openNoteCompanion } from "architecture/components/core/noteCompanion/openNoteCompanion";

/**
 * A retired view type kept registered **only** for back-compat (#272, §XI no-visible-breakage): when
 * Obsidian restores a saved/pinned leaf of an old ZettelFlow view type, this transient view opens the
 * surface + mode that type now lives in and then detaches itself — so the user never sees a "no view
 * of type X" pane. Never opened deliberately; the alias commands use {@link activateSurface} directly.
 */
export class LegacyRedirectView extends ItemView {
    constructor(leaf: WorkspaceLeaf, private readonly redirectType: string) {
        super(leaf);
    }

    /** The deferred hand-over, cleared if the leaf closes first. */
    private redirectTimer: number | undefined;

    getViewType(): string {
        return this.redirectType;
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.redirectTimer);
    }

    getDisplayText(): string {
        return "";
    }

    getIcon(): string {
        return "compass";
    }

    async onOpen(): Promise<void> {
        const target = LEGACY_VIEW_TARGETS[this.redirectType];
        if (!target) return;
        // Transform this very leaf into the surface (no flash, no orphan tab): a restored/pinned
        // old-type leaf becomes the surface it now lives in. Deferred so the workspace finishes
        // restoring first.
        this.redirectTimer = window.setTimeout(() => {
            if (isViewTarget(target)) {
                // This note lives in the right sidebar and there is only one (#640 decision 2): the
                // retired leaf closes and the one companion opens where it lives. Through the
                // serialised opener, so a workspace holding several retired leaves makes one.
                // Once the workspace has finished restoring: a sidebar leaf made mid-restore can
                // be lost.
                this.app.workspace.onLayoutReady(() => {
                    this.leaf.detach();
                    void openNoteCompanion(this.app);
                });
                return;
            }
            const state = { mode: target.mode, ...(target.lens ? { lens: target.lens } : {}) };
            void this.leaf.setViewState({ type: target.surface, state, active: true });
        }, 0);
    }
}

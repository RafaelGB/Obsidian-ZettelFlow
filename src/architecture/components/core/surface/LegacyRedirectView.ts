import { ItemView, WorkspaceLeaf } from "obsidian";
import { LEGACY_VIEW_TARGETS, isViewTarget, placeViewRedirect } from "./legacyTargets";
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

    getViewType(): string {
        return this.redirectType;
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
        window.setTimeout(() => {
            if (isViewTarget(target)) {
                // This note lives in the right sidebar and there is only one (#640 decision 2).
                const place = placeViewRedirect({
                    inRightSidebar: this.leaf.getRoot() === this.app.workspace.rightSplit,
                    companionExists: this.app.workspace.getLeavesOfType(target.view).length > 0,
                });
                if (place === "transform") {
                    void this.leaf.setViewState({ type: target.view, active: true });
                } else {
                    this.leaf.detach();
                    void openNoteCompanion(this.app);
                }
                return;
            }
            const state = { mode: target.mode, ...(target.lens ? { lens: target.lens } : {}) };
            void this.leaf.setViewState({ type: target.surface, state, active: true });
        }, 0);
    }
}

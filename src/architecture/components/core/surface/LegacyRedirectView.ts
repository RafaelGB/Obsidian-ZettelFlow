import { ItemView, WorkspaceLeaf } from "obsidian";
import { LEGACY_VIEW_TARGETS } from "./legacyTargets";

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
            void this.leaf.setViewState({ type: target.surface, state: { mode: target.mode }, active: true });
        }, 0);
    }
}

import { ItemView, WorkspaceLeaf } from "obsidian";
import { activateSurface } from "architecture/plugin";
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
        // Defer so the workspace has finished restoring before we open the surface and drop this leaf.
        window.setTimeout(() => {
            if (target) void activateSurface(this.app, target.surface, target.mode);
            this.leaf.detach();
        }, 0);
    }
}

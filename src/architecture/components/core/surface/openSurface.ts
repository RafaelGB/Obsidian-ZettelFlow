import { App } from "obsidian";
import { activateSurface } from "architecture/plugin";
import { LEGACY_OPEN_TARGETS, isViewTarget } from "./legacyTargets";
import { openNoteCompanion } from "architecture/components/core/noteCompanion/openNoteCompanion";

/**
 * Open the surface + mode that a retired `show-*`/opener command now maps to (#272). The command ids
 * are kept (so hotkeys/other plugins still work) but they open the consolidated surface directly.
 */
export function openSurfaceForCommand(app: App, commandId: string): void {
    const target = LEGACY_OPEN_TARGETS[commandId];
    if (!target) return;
    // The only standalone target is This note (#640): it has one opener, and it is that.
    if (isViewTarget(target)) void openNoteCompanion(app);
    else void activateSurface(app, target.surface, target.mode, target.lens ? { lens: target.lens } : undefined);
}

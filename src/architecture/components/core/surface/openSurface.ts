import { App } from "obsidian";
import { activateSurface } from "architecture/plugin";
import { LEGACY_OPEN_TARGETS } from "./legacyTargets";

/**
 * Open the surface + mode that a retired `show-*`/opener command now maps to (#272). The command ids
 * are kept (so hotkeys/other plugins still work) but they open the consolidated surface directly.
 */
export function openSurfaceForCommand(app: App, commandId: string): void {
    const target = LEGACY_OPEN_TARGETS[commandId];
    if (target) void activateSurface(app, target.surface, target.mode);
}

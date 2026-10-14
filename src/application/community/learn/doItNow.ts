import type { App } from "obsidian";
import { CAPABILITY_DOORS, type Capability, type Door } from "architecture/components/core/surface/capabilities";
import { runCommand } from "architecture/components/core/surface/runCommand";
import { openZettelFlowSettings } from "architecture/components/core/surface/openSettings";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { SETTINGS_SECTIONS, type SectionId } from "config/modals/settingsShell";

/**
 * **Do it now** (#802 FR-13): a lesson's button runs the capability it teaches, through that
 * capability's best door — the way the door already opens it, so nothing here is a second code path.
 *
 * Only a door Learn can *run* counts: the ribbon's entry and a command run the command, a surface
 * (or Home's line) opens the surface at its mode, a settings door opens ZettelFlow's settings on its
 * section. A control inside another view and a file's context menu need an object Learn does not
 * have, so they are skipped; a capability with no runnable door gets no button at all.
 */
export type DoorRun =
    | { kind: "command"; id: string }
    | { kind: "surface"; viewType: string; mode?: string }
    | { kind: "settings"; section?: SectionId };

function runnable(door: Door): DoorRun | null {
    if (door.kind === "command" || (door.kind === "object" && door.via === "ribbon")) return { kind: "command", id: door.at };
    if (door.kind === "surface" || door.kind === "recommendation") {
        const [viewType, mode] = door.at.split(":");
        return mode ? { kind: "surface", viewType, mode } : { kind: "surface", viewType };
    }
    if (door.kind === "settings") {
        const section = SETTINGS_SECTIONS.find((one) => one.titleKey === door.at)?.id;
        return section ? { kind: "settings", section } : { kind: "settings" };
    }
    return null;
}

/** The first door of `capability` that Learn can run, best first; null when there is none. */
export function resolveDoor(capability: string, doors: Record<string, Capability> = CAPABILITY_DOORS): DoorRun | null {
    const entry = Object.prototype.hasOwnProperty.call(doors, capability) ? doors[capability] : undefined;
    if (!entry) return null;
    for (const door of entry.doors) {
        const run = runnable(door);
        if (run) return run;
    }
    return null;
}

/** Go through the door. */
export function runDoor(app: App, run: DoorRun): void {
    switch (run.kind) {
        case "command":
            runCommand(run.id);
            return;
        case "surface":
            void activateSurface(app, run.viewType, run.mode);
            return;
        case "settings":
            openZettelFlowSettings(app, run.section);
            return;
    }
}

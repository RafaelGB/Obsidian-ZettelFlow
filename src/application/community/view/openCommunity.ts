import type { App } from "obsidian";
import { ObsidianApi } from "architecture";
import { COMMUNITY_VIEW, LAST_ROOM_KEY, roomToOpen, type Room } from "./communityRooms";

/**
 * **Open Community** (#798) — in the main area, the way the Library opens: the leaf already open is
 * revealed and pans to the room, so Community is never there twice (FR-5). With no room asked for,
 * it opens where you were last in this vault, and on Learn the first time (FR-6).
 *
 * Every door goes through here: the ribbon, the settings rows, the welcome, the two empty states and
 * the commands kept as aliases. It deliberately imports nothing heavier than the room vocabulary.
 */
export async function openCommunity(app: App, room?: Room, state: Record<string, unknown> = {}): Promise<void> {
    const target = roomToOpen(room, ObsidianApi.loadLocal(LAST_ROOM_KEY));
    ObsidianApi.saveLocal(LAST_ROOM_KEY, target);
    const { workspace } = app;
    const leaf = workspace.getLeavesOfType(COMMUNITY_VIEW)[0] ?? workspace.getLeaf("tab");
    // A deep link may say more than the room (#803): `{ tutorial }` opens that lesson in Learn.
    await leaf.setViewState({ type: COMMUNITY_VIEW, state: { ...state, room: target }, active: true });
    await workspace.revealLeaf(leaf);
}

/** From a settings row: the settings window steps aside first, so the view is what you see. */
export function openCommunityFromSettings(app: App, room: Room): void {
    (app as App & { setting?: { close?: () => void } }).setting?.close?.();
    void openCommunity(app, room);
}

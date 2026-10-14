import type { App, WorkspaceLeaf } from "obsidian";
import type ZettelFlow from "main";
import type { Room } from "./communityRooms";
import type { RoomCount } from "./roomNav";

/**
 * What a room is handed (#798): the app, the plugin it reads and saves through (injected, never looked
 * up while the plugin loads — #374), the leaf it lives in, and a way to send the camera to another
 * room — `then` runs once that room has arrived.
 */
export interface CommunityRoomHost {
    app: App;
    plugin: ZettelFlow;
    leaf: WorkspaceLeaf;
    openRoom(room: Room, then?: () => void): void;
}

/** A mounted room. Every hook is optional except letting go. */
export interface RoomHandle {
    /** The camera has arrived here. */
    shown?(): void;
    /** The camera is leaving. */
    hidden?(): void;
    /** What the nav shows beside its name, read whenever the nav redraws its counts. */
    count?(): RoomCount;
    dispose(): void;
}

/** One room's contents. S2, S5 and S6 each replace one. */
export interface RoomRenderer {
    mount(el: HTMLElement, host: CommunityRoomHost): RoomHandle;
}

export type RoomRenderers = Record<Room, RoomRenderer>;

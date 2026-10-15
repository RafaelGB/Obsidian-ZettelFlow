import type { App, Scope, WorkspaceLeaf } from "obsidian";
import type ZettelFlow from "main";
import type { Room } from "./communityRooms";
import type { RoomCount } from "./roomNav";

/**
 * What a room is handed (#798): the app, the plugin it reads and saves through (injected, never looked
 * up while the plugin loads — #374), the leaf it lives in, and a way to send the camera to another
 * room — `state` is handed to the rooms once it has arrived (a deep link: Contribute names the
 * contributing tutorial, #803), and `then` runs after that.
 */
export interface CommunityRoomHost {
    app: App;
    plugin: ZettelFlow;
    leaf: WorkspaceLeaf;
    openRoom(room: Room, then?: () => void, state?: Record<string, unknown>): void;
    /**
     * The canvas most recently focused in this window (#803 FR-2). While Community is the active tab
     * Obsidian's active file is `null`, so the view keeps track of it.
     */
    lastCanvas?(): string | null;
    /** A room's count changed (its catalog arrived, something was installed): redraw the nav's. */
    refreshCounts?(): void;
    /**
     * The view's keymap scope (#802): a room registers its own keys here while it is in view — Learn's
     * `/` and a lesson's arrows — and unregisters them when it leaves, so they never reach the editor.
     */
    scope?: Scope;
}

/** A mounted room. Every hook is optional except letting go. */
export interface RoomHandle {
    /** The camera has arrived here. */
    shown?(): void;
    /** The camera is leaving. */
    hidden?(): void;
    /** What the nav shows beside its name, read whenever the nav redraws its counts. */
    count?(): RoomCount;
    /**
     * What the room adds to the view's state (#799): the history entry Obsidian's *Back* returns to
     * carries it — Systems says which card the canvas flies home to.
     */
    viewState?(): Record<string, unknown>;
    /** The view's state, as a restore or a *Back* hands it over. */
    applyState?(state: Record<string, unknown>): void;
    /** The canvas last focused in this window changed (#803): Contribute's preview follows it. */
    canvasChanged?(): void;
    /** Esc, while this room is in view. True when it was the room's to take. */
    onEscape?(): boolean;
    dispose(): void;
}

/** One room's contents: each is native DOM since #803. */
export interface RoomRenderer {
    mount(el: HTMLElement, host: CommunityRoomHost): RoomHandle;
}

export type RoomRenderers = Record<Room, RoomRenderer>;

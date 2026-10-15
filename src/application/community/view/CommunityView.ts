import { ItemView, Scope, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { c, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import type ZettelFlow from "main";
import { COMMUNITY_VIEW, FIRST_ROOM, LAST_ROOM_KEY, ROOMS, isRoom, type Room } from "./communityRooms";
import { CommunityPan, ownWindow, placeIndicator } from "./communityPan";
import { RoomNav } from "./roomNav";
import type { CommunityRoomHost, RoomHandle, RoomRenderers } from "./communityRoomHost";
import { SYSTEMS_ROOM } from "./systemsRoom";
import { LEARN_ROOM } from "./learnRoom";
import { CONTRIBUTE_ROOM } from "./contributeRoom";
import { INSTALLED_ROOM } from "./installedRoom";

export { COMMUNITY_VIEW };

/** Each view's ids are its own: two windows may each hold a Community leaf for a moment. */
let views = 0;

/**
 * **Community** (#798, epic #797) — where you learn ZettelFlow, find a system, give one back and
 * look after what you installed. One view in the main area, four rooms side by side — Learn ·
 * Systems · Contribute · Installed — and a camera that pans between them (§XVI).
 *
 * The room in view is the view's state: it survives a reload, and whoever opens the view can name
 * it (a deep link). There is one Community leaf; {@link openCommunity} reveals it rather than
 * opening a second. It is a navigation view because later slices open a canvas in this same leaf,
 * and Obsidian's *Back* has to come home to the room it left.
 *
 * Choosing a room writes nothing but which room was last open, in this device's storage for the
 * vault. Every room is native DOM: since #803 the view mounts no React at all.
 */
export class CommunityView extends ItemView {
    navigation = true;
    private room: Room = FIRST_ROOM;
    private nav: RoomNav | null = null;
    private strip: HTMLElement | null = null;
    private readonly roomEls = new Map<Room, HTMLElement>();
    private readonly handles = new Map<Room, RoomHandle>();
    private readonly pan = new CommunityPan();
    private readonly idPrefix = `zf-community-${++views}`;
    /** The pan in flight, so a caller can wait for the room it asked for. */
    private moving: Promise<void> = Promise.resolve();
    /** State handed over before the rooms were mounted. */
    private pending: Record<string, unknown> | null = null;
    /** The canvas last focused in this window (#803): what Contribute would share. */
    private focusedCanvas: string | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZettelFlow,
        /** A seam for tests and for the slices that replace a room's contents one at a time. */
        private readonly renderers: RoomRenderers = { learn: LEARN_ROOM, systems: SYSTEMS_ROOM, contribute: CONTRIBUTE_ROOM, installed: INSTALLED_ROOM }
    ) {
        super(leaf);
        // The view's own keys. Esc first asks the room in view — Systems closes the system you have
        // open, Learn the lesson — and is otherwise Obsidian's. A room adds its own keys to this scope
        // while it is in view (Learn's `/` and a lesson's arrows, #802) and takes them away as it goes.
        this.scope = new Scope(this.app?.scope);
        this.scope.register([], "Escape", () => (this.handles.get(this.room)?.onEscape?.() ? false : true));
    }

    /** A literal: `ItemView` calls this from its own constructor, before any field exists (#278). */
    getViewType(): string {
        return "zettelflow-community";
    }

    getDisplayText(): string {
        return t("community_view_title");
    }

    getIcon(): string {
        return "users";
    }

    getState(): Record<string, unknown> {
        // A room may add to it (#799): the canvas a *Back* returns from names its card.
        const rooms = [...this.handles.values()].reduce<Record<string, unknown>>((all, handle) => ({ ...all, ...handle.viewState?.() }), {});
        return { ...super.getState(), ...rooms, room: this.room };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const value = (state ?? {}) as Record<string, unknown>;
        const room = isRoom(value.room) ? value.room : FIRST_ROOM;
        if (this.strip) {
            await this.go(room, false);
            this.handOver(value);
        } else {
            this.room = room;
            this.pending = value;
        }
    }

    /** The state, to every room that reads it — once the rooms exist. */
    private handOver(state: Record<string, unknown>): void {
        for (const handle of this.handles.values()) handle.applyState?.(state);
    }

    /** The room in view, then the one asked for once it has arrived (a room's `openRoom`). */
    async whenSettled(): Promise<void> {
        await this.moving;
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass(c("community-host"));
        const root = this.contentEl.createDiv({ cls: c("community") });
        const head = root.createDiv({ cls: c("community-head") });
        const title = head.createDiv({ cls: c("community-title") });
        setIcon(title.createSpan({ cls: c("community-title-icon") }), "users");
        title.createSpan({ cls: c("community-title-text"), text: t("community_view_title") });
        this.nav = new RoomNav(head, {
            active: this.room,
            tabId: (room) => `${this.idPrefix}-tab-${room}`,
            panelId: (room) => `${this.idPrefix}-room-${room}`,
            onChoose: (room, enter) => void this.go(room, enter),
        });
        const viewport = root.createDiv({ cls: c("community-rooms") });
        this.strip = viewport.createDiv({ cls: c("community-strip") });
        for (const room of ROOMS) {
            const el = this.strip.createEl("section", {
                cls: c("community-room"),
                attr: { id: `${this.idPrefix}-room-${room}`, role: "tabpanel", "aria-labelledby": `${this.idPrefix}-tab-${room}`, tabindex: "-1", "data-room": room },
            });
            this.roomEls.set(room, el);
        }
        const host: CommunityRoomHost = {
            app: this.app,
            plugin: this.plugin,
            leaf: this.leaf,
            openRoom: (room, then, state) => {
                void this.go(room, false).then(() => {
                    if (state && this.room === room) this.handOver(state);
                    then?.();
                });
            },
            refreshCounts: () => this.refreshCounts(),
            lastCanvas: () => this.lastCanvas(),
            scope: this.scope ?? undefined,
        };
        this.trackCanvases();
        for (const room of ROOMS) {
            const el = this.roomEls.get(room);
            if (el) this.handles.set(room, this.renderers[room].mount(el, host));
        }
        // The nav's names come and go with the width: the indicator follows its tab, unanimated.
        const Observer = (ownWindow(this.contentEl) as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
        if (Observer && this.nav) {
            const nav = this.nav;
            const observer = new Observer(() => this.placeStill());
            observer.observe(nav.el);
            this.register(() => observer.disconnect());
        }
        await this.go(this.room, false, true);
        if (this.pending) {
            const state = this.pending;
            this.pending = null;
            this.handOver(state);
        }
    }

    async onClose(): Promise<void> {
        this.pan.finish();
        for (const handle of this.handles.values()) handle.dispose();
        this.handles.clear();
        this.roomEls.clear();
        this.nav = null;
        this.strip = null;
        this.contentEl.empty();
    }

    /**
     * Send the camera to `room`. `focusRoom`: the room was chosen with a click, Enter or Space, so
     * focus goes into it once it has arrived. `still`: the first picture, which is not a move.
     */
    private go(room: Room, focusRoom: boolean, still = false): Promise<void> {
        const run = async () => {
            const strip = this.strip;
            const nav = this.nav;
            if (!strip || !nav) {
                this.room = room;
                return;
            }
            const before = this.room;
            const from = still ? -1 : ROOMS.indexOf(before);
            const to = ROOMS.indexOf(room);
            if (before !== room) this.handles.get(before)?.hidden?.();
            this.room = room;
            ObsidianApi.saveLocal(LAST_ROOM_KEY, room);
            nav.select(room);
            this.refreshCounts();
            for (const [id, el] of this.roomEls) {
                const away = id !== room;
                if (away) {
                    el.setAttribute("inert", "");
                    el.setAttribute("aria-hidden", "true");
                } else {
                    el.removeAttribute("inert");
                    el.removeAttribute("aria-hidden");
                }
            }
            const rooms = ROOMS.map((id) => this.roomEls.get(id)).filter((el): el is HTMLElement => !!el);
            await this.pan.run({ strip, rooms, from, to, indicator: { el: nav.indicator, from: from >= 0 ? nav.span(before) : null, to: nav.span(room) } });
            if (this.room !== room) return;
            this.handles.get(room)?.shown?.();
            if (focusRoom) this.roomEls.get(room)?.focus();
            if (before !== room) this.app?.workspace?.requestSaveLayout?.();
        };
        this.moving = run();
        return this.moving;
    }

    /**
     * The canvas you last had in front of you in this window (#803 FR-2): the most recent leaf when
     * it is one, then kept by every tab change — a canvas tab in another window is not this
     * window's, so it does not count. Until then, the files Obsidian last opened stand in.
     */
    private trackCanvases(): void {
        const workspace = this.app?.workspace;
        if (!workspace) return;
        this.focusedCanvas = this.canvasOf(workspace.getMostRecentLeaf?.() ?? null);
        this.registerEvent(
            workspace.on("active-leaf-change", (leaf) => {
                const path = this.canvasOf(leaf);
                if (!path || path === this.focusedCanvas) return;
                const el = leaf?.view?.containerEl;
                if (el && ownWindow(el) !== ownWindow(this.contentEl)) return;
                this.focusedCanvas = path;
                for (const handle of this.handles.values()) handle.canvasChanged?.();
            })
        );
    }

    /**
     * The canvas tracked, while it still exists; else the most recent canvas Obsidian opened that
     * still does — a canvas deleted since (an install taken back) is never offered.
     */
    private lastCanvas(): string | null {
        const vault = this.app?.vault;
        const exists = (path: string | null | undefined): path is string => !!path && !!vault?.getFileByPath?.(path);
        if (exists(this.focusedCanvas)) return this.focusedCanvas;
        return this.app?.workspace?.getLastOpenFiles?.().find((path) => path.endsWith(".canvas") && exists(path)) ?? null;
    }

    private canvasOf(leaf: WorkspaceLeaf | null): string | null {
        const view = leaf?.view as { getViewType?: () => string; file?: { path?: string } | null } | undefined;
        if (view?.getViewType?.() !== "canvas") return null;
        return view.file?.path ?? null;
    }

    /** The indicator under the room in view, with no motion: a resize is not a gesture. */
    private placeStill(): void {
        if (this.nav) placeIndicator(this.nav.indicator, this.nav.span(this.room));
    }

    /** Each room's count, as the nav shows it beside the room's name. */
    refreshCounts(): void {
        if (!this.nav) return;
        for (const room of ROOMS) this.nav.setCount(room, this.handles.get(room)?.count?.() ?? null);
    }
}

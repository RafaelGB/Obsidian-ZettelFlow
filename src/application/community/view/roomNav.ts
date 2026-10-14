import { setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ROOMS, ROOM_ICON, ROOM_LABEL_KEY, type Room } from "./communityRooms";
import type { Span } from "./communityPan";

/** What a room shows beside its name: a number, a `done/total`, or nothing yet. */
export type RoomCount = number | { done: number; total: number } | null;

export interface RoomNavOptions {
    active: Room;
    /** The id of each room's panel, which its tab controls. */
    panelId: (room: Room) => string;
    tabId: (room: Room) => string;
    /**
     * A room was chosen. `enter`: by a click, Enter or Space — focus goes into the room once it has
     * arrived. The arrows move the selection and leave focus on the nav, so a second press goes on.
     */
    onChoose: (room: Room, enter: boolean) => void;
}

/**
 * **The room nav** (#798 FR-2, FR-11): a tablist of the four rooms — each a Lucide icon and its name,
 * a count once the room has one, and an indicator that slides under the room in view. Left and Right
 * move between rooms, Home and End go to the ends, Enter selects; one tab is in the Tab order at a
 * time (roving `tabindex`). Where it is too narrow for the names, the icons carry them as their
 * accessible names.
 */
export class RoomNav {
    readonly el: HTMLElement;
    readonly indicator: HTMLElement;
    private readonly tabs = new Map<Room, HTMLElement>();
    private readonly badges = new Map<Room, HTMLElement>();
    private active: Room;

    constructor(parent: HTMLElement, private readonly options: RoomNavOptions) {
        this.active = options.active;
        this.el = parent.createDiv({ cls: c("community-nav"), attr: { role: "tablist", "aria-label": t("community_rooms_label") } });
        this.indicator = this.el.createDiv({ cls: c("community-nav-indicator"), attr: { "aria-hidden": "true" } });
        for (const room of ROOMS) {
            const label = t(ROOM_LABEL_KEY[room]);
            const tab = this.el.createEl("button", {
                cls: c("community-nav-tab"),
                attr: { type: "button", role: "tab", id: options.tabId(room), "aria-controls": options.panelId(room), "aria-label": label, "data-room": room },
            });
            setIcon(tab.createSpan({ cls: c("community-nav-icon") }), ROOM_ICON[room]);
            tab.createSpan({ cls: c("community-nav-label"), text: label });
            const badge = tab.createSpan({ cls: [c("community-nav-count"), c("is-hidden")], attr: { "aria-hidden": "true" } });
            this.badges.set(room, badge);
            tab.addEventListener("click", () => options.onChoose(room, true));
            tab.addEventListener("keydown", (evt: KeyboardEvent) => this.onKey(room, evt));
            this.tabs.set(room, tab);
        }
        this.select(this.active);
    }

    /** Mark `room` as the one in view. Drawing only: the pan is the view's. */
    select(room: Room): void {
        this.active = room;
        for (const [id, tab] of this.tabs) {
            const on = id === room;
            tab.setAttribute("aria-selected", on ? "true" : "false");
            tab.setAttribute("tabindex", on ? "0" : "-1");
            tab.toggleClass("is-active", on);
        }
    }

    /** A room's count; `null` or zero draws nothing — an empty room does not announce a 0. */
    setCount(room: Room, count: RoomCount): void {
        const badge = this.badges.get(room);
        if (!badge) return;
        const text = count === null ? "" : typeof count === "number" ? (count > 0 ? String(count) : "") : count.total > 0 ? t("community_learn_count", String(count.done), String(count.total)) : "";
        badge.setText(text);
        badge.toggleClass(c("is-hidden"), text === "");
    }

    /** Where a tab sits along the nav, for the indicator; `null` before the nav has a layout. */
    span(room: Room): Span | null {
        const tab = this.tabs.get(room);
        // No layout yet (a tab in the background, or a test): the indicator waits for one.
        const w = tab?.offsetWidth || 0;
        return tab && w > 0 ? { x: tab.offsetLeft || 0, w } : null;
    }

    focus(room: Room): void {
        this.tabs.get(room)?.focus();
    }

    private onKey(room: Room, evt: KeyboardEvent): void {
        const at = ROOMS.indexOf(room);
        let next: Room | null = null;
        if (evt.key === "ArrowRight") next = ROOMS[(at + 1) % ROOMS.length];
        else if (evt.key === "ArrowLeft") next = ROOMS[(at - 1 + ROOMS.length) % ROOMS.length];
        else if (evt.key === "Home") next = ROOMS[0];
        else if (evt.key === "End") next = ROOMS[ROOMS.length - 1];
        else if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            this.options.onChoose(room, true);
            return;
        }
        if (!next) return;
        evt.preventDefault();
        this.focus(next);
        this.options.onChoose(next, false);
    }
}

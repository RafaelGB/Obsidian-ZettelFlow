import type { t } from "architecture/lang";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **Community is a view** (#798, epic #797): one leaf, four rooms, a camera that pans between them.
 * The vocabulary every door and the view itself share — pure, so the opener stays as light as a
 * settings row can import.
 */
export const COMMUNITY_VIEW = "zettelflow-community";

/** The rooms, in the order they sit along the strip — and so the side each one arrives from. */
export const ROOMS = ["learn", "systems", "contribute", "installed"] as const;

export type Room = (typeof ROOMS)[number];

/** The room a first visit opens on: the place that teaches what everything else is. */
export const FIRST_ROOM: Room = "learn";

export function isRoom(value: unknown): value is Room {
    return typeof value === "string" && (ROOMS as readonly string[]).includes(value);
}

/** Lucide icons — the nav shows only these where it is too narrow for the labels. */
export const ROOM_ICON: Record<Room, string> = {
    learn: "graduation-cap",
    systems: "layout-grid",
    contribute: "git-pull-request",
    installed: "package-check",
};

/** Literal keys, so the locale guardrail sees every room's name. */
export const ROOM_LABEL_KEY: Record<Room, LocaleKey> = {
    learn: "community_room_learn",
    systems: "community_room_systems",
    contribute: "community_room_contribute",
    installed: "community_room_installed",
};

/** The last room used, per vault (Obsidian's own local storage — decision 4 on #797). */
export const LAST_ROOM_KEY = "zettelflow-community-room";

/**
 * The room an opening lands on: the one asked for, else the last one used here, else Learn. A value
 * that is not a room — an old key, a hand edit — is as good as none.
 */
export function roomToOpen(requested: unknown, saved: unknown): Room {
    if (isRoom(requested)) return requested;
    if (isRoom(saved)) return saved;
    return FIRST_ROOM;
}

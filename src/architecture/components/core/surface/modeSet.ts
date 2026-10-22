/**
 * **Home, Cultivate and Think as one set** (#875) — the pure part: where the camera goes, which shot a
 * move gets, the one way back, and when Esc is yours to take. No DOM and no Obsidian here, so every
 * rule the shot follows is a plain function a test can read.
 */

export type PanDirection = "left" | "right" | "none";

export interface PanPlan {
    from: number;
    to: number;
    direction: PanDirection;
    /** The modes the camera crosses on its way, in the order it crosses them. */
    passes: string[];
}

/** The camera's way from one mode to another along the set, in the tab order (#875 FR-1, FR-2). */
export function panPlan(order: readonly string[], from: string, to: string): PanPlan {
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0 || a === b) return { from: a, to: b, direction: "none", passes: [] };
    const passes = a < b ? order.slice(a + 1, b) : order.slice(b + 1, a).reverse();
    return { from: a, to: b, direction: a < b ? "right" : "left", passes };
}

/** How a move was asked for: the mode bar, a card that is a door, the way back, or from outside. */
export type Via = "bar" | "door" | "back" | "link";

export type Shot = "instant" | "pan" | "pan+flight";

/**
 * Which shot a move gets (#875 FR-9, FR-16, FR-18): a deep link or a restored layout lands with no
 * shot; reduced motion is instant; a door or the way back flies its card when there is a place for it
 * to land, and pans plainly when there is not.
 */
export function shotPlan(move: { motion: boolean; via: Via; landing: boolean }): Shot {
    if (move.via === "link" || !move.motion) return "instant";
    if ((move.via === "door" || move.via === "back") && move.landing) return "pan+flight";
    return "pan";
}

/** Which door a card is, so the way back can find it again in a Home drawn afresh. */
export type DoorOrigin = "last-thought" | "idea-to-tend";

export interface DoorState {
    back: { to: string; origin: DoorOrigin } | null;
}

export const NO_DOORS: DoorState = { back: null };

export type DoorEvent =
    | { kind: "door"; from: string; to: string; origin: DoorOrigin }
    | { kind: "bar" }
    | { kind: "link" }
    | { kind: "back" };

/**
 * The way back (#875 FR-13): a door remembers the card you pressed, and back returns to it **once**.
 * Moving by the bar, or anything opening a mode from outside the tab, forgets it — back is never a
 * history of everywhere you went, only the reverse of the shot you just saw.
 */
export function doors(state: DoorState, event: DoorEvent): DoorState {
    if (event.kind === "door") return { back: { to: event.from, origin: event.origin } };
    return NO_DOORS;
}

/**
 * Whether Esc is the set's to take (#875 FR-12): only with the focus in this view and not in a text
 * box, nothing open over it, and the mode not using Esc itself. Otherwise the key goes on, untouched.
 */
export function escapeIsFree(at: { writing: boolean; insideView: boolean; overlayOpen: boolean; modeClaims: boolean }): boolean {
    return at.insideView && !at.writing && !at.overlayOpen && !at.modeClaims;
}

/**
 * Where a pane scrolls so its landing sits in the middle (#875): by number, never `scrollIntoView`,
 * which would move the set sideways under the camera. Clamped to what the pane can scroll.
 */
export function centeredScrollTop(entryTop: number, entryHeight: number, paneHeight: number, scrollHeight: number): number {
    const max = Math.max(0, scrollHeight - paneHeight);
    const centred = Math.round(entryTop + entryHeight / 2 - paneHeight / 2);
    return Math.min(max, Math.max(0, centred));
}

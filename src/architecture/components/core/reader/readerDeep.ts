/**
 * **Deep reading** (#764, epic #739): the page and nothing else. What used to be *Fullscreen* grows
 * into it — the same button, the same F. The rules here are pure: which keys read without waking the
 * chrome, how far a pointer must move before it counts, and what the next Esc closes.
 */

/** A pointer that moves less than this, in CSS pixels, is a jitter: the chrome stays away (FR-3). */
export const JITTER_PX = 4;

/** The modifiers a key came with, as the keymap reports them. */
export interface KeyModifiers {
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    alt?: boolean;
}

/** The keys that read: they turn and scroll, and never bring the chrome back (FR-4). */
const READING_KEYS = new Set([" ", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"]);

/** Space, Shift+Space, the arrows, PageUp/PageDown and Home/End — nothing with Ctrl, ⌘ or Alt. */
export function isReadingKey(key: string, modifiers: KeyModifiers = {}): boolean {
    if (modifiers.ctrl || modifiers.meta || modifiers.alt) return false;
    if (modifiers.shift && key !== " ") return false;
    return READING_KEYS.has(key);
}

/** Whether a pointer moved past a jitter, from where it last woke the chrome. */
export function movedEnough(dx: number, dy: number): boolean {
    return Math.hypot(dx, dy) > JITTER_PX;
}

/** What is open over the page, nearest first. */
export interface OpenOverPage {
    shortcuts?: boolean;
    note?: boolean;
    search?: boolean;
    popover?: boolean;
    peek?: boolean;
    detour?: boolean;
    panel?: boolean;
    deep?: boolean;
}

export type EscapeStep = "shortcuts" | "note" | "search" | "popover" | "peek" | "detour" | "panel" | "deep" | "exit";

/** The Esc order: today's nearest-first order, with deep reading just before leaving the Reader (FR-6). */
const ORDER: readonly Exclude<EscapeStep, "exit">[] = ["shortcuts", "note", "search", "popover", "peek", "detour", "panel", "deep"];

/** The one thing the next Esc closes: the nearest open thing, and the Reader itself when nothing is. */
export function escapeStep(open: OpenOverPage): EscapeStep {
    return ORDER.find((step) => open[step]) ?? "exit";
}

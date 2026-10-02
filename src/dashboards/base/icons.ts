/**
 * `setIcon` with a fallback (#632 UX). Lucide renames icons between Obsidian releases (the heatmap's
 * `grid-3x3` drew nothing on a current build), and an empty tile reads as a bug. If the requested id
 * renders nothing, draw the fallback instead.
 */
import { setIcon } from "obsidian";

export function setIconWithFallback(el: HTMLElement, icon: string, fallback = "box"): void {
    setIcon(el, icon);
    if (el.childElementCount === 0 && icon !== fallback) setIcon(el, fallback);
}

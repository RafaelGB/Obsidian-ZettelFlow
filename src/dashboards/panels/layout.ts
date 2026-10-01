/**
 * The dashboard grid, as pure functions (epic #622, S3 #625). Rather than a drag-and-resize library
 * that positions with inline styles and ships its own non-theme CSS (a §XV and bundle cost), the
 * layout is class-driven: a panel's width/height are modifier classes, and its place is its index in
 * `DashboardModel.panels`. Moving and resizing are pure array/record transforms — testable, and the
 * DOM just reflects them.
 */
import type { PanelConfig, PanelLayout } from "./types";

export const DEFAULT_LAYOUT: PanelLayout = { w: 1, h: 1 };

export function panelLayout(config: PanelConfig): PanelLayout {
    return config.layout ?? DEFAULT_LAYOUT;
}

export function cycleWidth(layout: PanelLayout): PanelLayout {
    const w = (layout.w >= 3 ? 1 : layout.w + 1) as PanelLayout["w"];
    return { ...layout, w };
}

export function cycleHeight(layout: PanelLayout): PanelLayout {
    const h = (layout.h >= 2 ? 1 : layout.h + 1) as PanelLayout["h"];
    return { ...layout, h };
}

/** Reorder a panel one step earlier (-1) or later (+1); a no-op at the ends. */
export function movePanel(panels: PanelConfig[], id: string, dir: -1 | 1): PanelConfig[] {
    const index = panels.findIndex((panel) => panel.id === id);
    if (index < 0) return panels;
    const target = index + dir;
    if (target < 0 || target >= panels.length) return panels;
    const next = [...panels];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
}

/** The modifier classes for a layout, scoped under the panel class (e.g. `is-w2 is-h1`). */
export function layoutClasses(layout: PanelLayout): string[] {
    return [`is-w${layout.w}`, `is-h${layout.h}`];
}

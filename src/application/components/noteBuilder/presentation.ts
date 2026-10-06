/**
 * The wizard's presentation decisions, as pure functions (#409, epic #405).
 *
 * Two of them exist because the values they handle are *not* what their names suggest:
 *
 * - A step's accent used to be `section.color`, which is only ever `""` or the literal `"info"` — it
 *   was painted as `borderColor: "info"`, invalid CSS on an element with no border width. The accent
 *   the wizard clearly meant is the **current canvas node's** colour, which `getCanvasColor` has
 *   already converted to either an `r, g, b` triple or a `var(--canvas-color-N)` reference. Both are
 *   consumed through `rgba(var(--zf-step-accent), …)`, and the "no colour" sentinel yields no accent.
 * - Density is a user preference that must survive a corrupt or missing setting.
 */

/** What `getCanvasColor` returns for a node with no colour of its own. */
export const NO_CANVAS_COLOR = "var(--embed-background)";

/**
 * The value for `--zf-step-accent`, or `undefined` when the step should carry no accent. Anything
 * that is not a usable colour reference (the sentinel, an empty string) yields no accent rather than
 * an invalid declaration.
 */
export function stepAccent(color: string | undefined): string | undefined {
    if (!color) return undefined;
    const trimmed = color.trim();
    if (trimmed.length === 0 || trimmed === NO_CANVAS_COLOR) return undefined;
    return trimmed;
}

/**
 * A usable CSS colour for an accent (#684), whatever shape `getCanvasColor` handed over.
 *
 * Measured against Obsidian 1.14's own stylesheet: a preset's `--canvas-color-N` is **a colour**
 * (`var(--color-green)`), not an `r, g, b` triple — so the `rgba(var(--canvas-color), …)` the
 * option list and the step edge were painted with was invalid for every preset colour, and the
 * colours that were meant to carry the phase never painted at all. A hex node still arrives as a
 * triple; it is wrapped in `rgb()`. Either way the stylesheet receives a colour and mixes it.
 */
export function accentColour(color: string | undefined): string | undefined {
    const value = stepAccent(color);
    if (!value) return undefined;
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(value)) return `rgb(${value})`;
    return value;
}

export const WIZARD_DENSITIES = ["comfortable", "compact"] as const;
export type WizardDensity = (typeof WIZARD_DENSITIES)[number];
export const DEFAULT_WIZARD_DENSITY: WizardDensity = "comfortable";

/** A persisted density, defaulting rather than throwing on anything unexpected. */
export function normalizeDensity(value: unknown): WizardDensity {
    return WIZARD_DENSITIES.includes(value as WizardDensity)
        ? (value as WizardDensity)
        : DEFAULT_WIZARD_DENSITY;
}

/** The modifier suffix a density adds to the wizard root; the comfortable default adds nothing. */
export function densityModifier(density: WizardDensity): string | undefined {
    return density === "compact" ? "is-compact" : undefined;
}

/**
 * The header's progress (#684, epic #676): how far along the walk is, as a bar that can be drawn.
 *
 * `step` is the 1-based position; `remaining` is the honest estimate `remainingSteps` gives, or
 * `undefined` when the flow cannot stand behind one (a cycle, an unknown node). Without an estimate
 * there is no denominator, so there is no bar — only the position, as before (#408). A bar is never
 * full while a step is still being asked: the step in front of you is not done yet.
 */
export interface WalkProgress {
    step: number;
    remaining?: number;
    /** Completed share, 0–100, or `undefined` when no estimate exists. */
    percent?: number;
}

export function walkProgress(step: number, remaining: number | undefined): WalkProgress {
    const position = Math.max(1, Math.floor(step));
    if (remaining === undefined || !Number.isFinite(remaining) || remaining < 0) {
        return { step: position };
    }
    const left = Math.floor(remaining);
    const total = position + left;
    // The steps already answered over the whole walk, plus half of the one being asked.
    const percent = Math.round(((position - 0.5) / total) * 100);
    return { step: position, remaining: left, percent: Math.min(99, Math.max(1, percent)) };
}

/**
 * What the persistent footer offers (#684): Back · Skip this step · Build with what I have, with the
 * step's own Confirm drawn beside them. Every control keeps its place: a control that does not apply
 * is **disabled or hidden in place**, never removed, so nothing under the pointer moves between steps.
 */
export interface FooterModel {
    back: { enabled: boolean };
    skip: { shown: boolean };
    build: { enabled: boolean };
}

export function footerModel(input: {
    canGoBack: boolean;
    canSkip: boolean;
    hasContent: boolean;
    building: boolean;
}): FooterModel {
    const { canGoBack, canSkip, hasContent, building } = input;
    return {
        back: { enabled: canGoBack && !building },
        skip: { shown: canSkip && !building },
        build: { enabled: hasContent && !building },
    };
}

/** How many walked steps the breadcrumb shows before it folds the middle away (#684). */
export const CRUMBS_BEFORE_FOLDING = 3;

/**
 * Which walked steps the breadcrumb draws (#684). A long walk folds its middle into one "…" control
 * instead of truncating the current step away — the newest steps stay, because those are the ones
 * you go back to. `folded` is how many are hidden behind the control (0 when nothing is).
 */
export function foldedCrumbs(
    walked: number,
    expanded: boolean
): { shown: number[]; folded: number } {
    const all = Array.from({ length: Math.max(0, walked) }, (_, index) => index);
    if (expanded || all.length <= CRUMBS_BEFORE_FOLDING) return { shown: all, folded: 0 };
    const keep = CRUMBS_BEFORE_FOLDING - 1;
    return { shown: all.slice(all.length - keep), folded: all.length - keep };
}

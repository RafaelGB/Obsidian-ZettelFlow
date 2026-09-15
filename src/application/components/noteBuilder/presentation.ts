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

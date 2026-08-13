import type { Action } from "architecture/api";
import type { StepSettings } from "zettelkasten";

/**
 * The ordered on-creation behavior of a **Knowledge Pattern** (#170) — the `hasUI:false` actions a
 * template runs when a note is created from it. A legacy template with no `onCreation` field yields
 * `[]` (a plain static template), so back-compat is guaranteed. Pure: never mutates `settings`.
 */
export function resolveOnCreationActions(settings: StepSettings): Action[] {
    return settings.onCreation ?? [];
}

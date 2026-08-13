import { t } from "architecture/lang";
import { LIFECYCLE_STATES, STATE_LABEL_KEY, type LifecycleState, type LocalizedAliasMap } from "./lifecycle";

/**
 * Build the localized-label → token alias map from the i18n layer. Impure (uses `t()`), so it lives
 * OUTSIDE `lifecycle/` to keep that folder Obsidian/i18n-free (the purity guard scans `lifecycle/`).
 * Notes are always stored as ASCII tokens (decision #3); this only helps re-read a value a user may
 * have typed as a localized label.
 */
export function buildLifecycleAliases(): LocalizedAliasMap {
    const aliases: Record<string, LifecycleState> = {};
    for (const state of LIFECYCLE_STATES) {
        aliases[t(STATE_LABEL_KEY[state])] = state;
    }
    return aliases;
}

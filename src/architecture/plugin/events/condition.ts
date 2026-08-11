/**
 * A binding's optional condition, evaluated as a `zf` script (#150, maintainer decision OQ-6). The
 * runtime injects `runScript` — the same async evaluator behind the property hooks / the Script
 * action (`buildAsyncScriptFunction` + `fnsManager.getFns()`) — so this module stays pure &
 * Obsidian-free. An **absent/blank** condition means "always". A script that **throws or is invalid**
 * is caught → the binding is **skipped safely** (returns `false`) and logged; it must never break the
 * vault (FR-4, AC-2). A non-throwing script's return value is coerced to a boolean.
 */

import { log } from "architecture";

/** A `zf`-style script runner: given source and a context, returns (a promise of) some value. */
export type ConditionRunner = (script: string, ctx: unknown) => unknown | Promise<unknown>;

/**
 * Evaluate a binding condition. Absent/blank → `true`. Otherwise run `script` via `runScript` and
 * coerce the (awaited) result to a boolean; any throw is contained and yields `false` + a debug skip.
 */
export async function evaluateBindingCondition(
    condition: string | undefined,
    ctx: unknown,
    runScript: ConditionRunner
): Promise<boolean> {
    if (condition === undefined || condition.trim() === "") return true;
    try {
        const result = await runScript(condition, ctx);
        return Boolean(result);
    } catch (error) {
        log.debug("Event-driven binding skipped: condition threw", error);
        return false;
    }
}

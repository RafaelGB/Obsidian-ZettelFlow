/**
 * The dispatch pipeline (#150) — the heart of the event engine, kept pure so every branch is unit
 * tested. A normalized event enters and is taken through the FR-10 gate order:
 *
 *   enabled? → match bindings → self-write guard → (per binding) cascade cap → condition → throttle → fire
 *
 * Every fire goes through the injected `runWorkflow` (the *same* entry a manual run uses — FR-3), and
 * every meaningful skip is logged (FR-10). The result is one `DispatchResult` per matched binding (or a
 * single short-circuit result for the event-level gates), which the tests assert against. Obsidian-free:
 * the runtime engine injects the clock, the self-write state, the script runner, and the fire callback.
 */

import { log } from "architecture";
import type { WorkflowEventPayload } from "./vocabulary";
import { matchBindings, type WorkflowBinding } from "./bindings";
import type { ThrottleGate } from "./throttle";
import { isSelfWrite, type CascadeGuard, type SelfWriteState } from "./loopGuard";
import { evaluateBindingCondition, type ConditionRunner } from "./condition";

/** The outcome of dispatching an event against one binding (or an event-level short-circuit). */
export enum DispatchResult {
    FIRED = "FIRED",
    SKIP_DISABLED = "SKIP_DISABLED",
    SKIP_NO_MATCH = "SKIP_NO_MATCH",
    SKIP_SELF_WRITE = "SKIP_SELF_WRITE",
    SKIP_CASCADE = "SKIP_CASCADE",
    SKIP_CONDITION = "SKIP_CONDITION",
    SKIP_THROTTLED = "SKIP_THROTTLED",
}

/** Everything the pipeline needs, injected so the core stays pure & testable. */
export interface DispatchDeps {
    /** Whether event-driven execution is enabled (the OFF-by-default global toggle). */
    enabled: () => boolean;
    /** The current live binding set (rebuilt by the engine on flow changes). */
    bindings: () => WorkflowBinding[];
    /** The `VaultStateManager` freeze / on-process view, for self-write suppression. */
    selfWriteState: () => SelfWriteState;
    throttle: ThrottleGate;
    cascade: CascadeGuard;
    /** Runs a binding's `zf` condition script. */
    runScript: ConditionRunner;
    /** Fires the bound workflow through the normal execution entry (FR-3). */
    runWorkflow: (binding: WorkflowBinding, payload: WorkflowEventPayload) => void | Promise<void>;
    /** Monotonic clock for the throttle window. */
    now: () => number;
}

/** Per-binding-per-note throttle key. */
function throttleKey(binding: WorkflowBinding, payload: WorkflowEventPayload): string {
    return `${binding.flowPath}#${binding.nodeId ?? ""}::${payload.notePath}`;
}

export async function dispatchEvent(
    payload: WorkflowEventPayload,
    deps: DispatchDeps
): Promise<DispatchResult[]> {
    if (!deps.enabled()) return [DispatchResult.SKIP_DISABLED];

    const matched = matchBindings(payload.event, deps.bindings());
    if (matched.length === 0) return [DispatchResult.SKIP_NO_MATCH];

    if (isSelfWrite(payload.notePath, deps.selfWriteState())) {
        log.debug(`Event-driven skip (self-write): ${payload.event} on ${payload.notePath}`);
        return [DispatchResult.SKIP_SELF_WRITE];
    }

    const results: DispatchResult[] = [];
    for (const binding of matched) {
        if (!deps.cascade.allows(payload.notePath)) {
            log.debug(`Event-driven skip (cascade cap): ${payload.notePath}`);
            results.push(DispatchResult.SKIP_CASCADE);
            continue;
        }

        const pass = await evaluateBindingCondition(binding.condition, payload, deps.runScript);
        if (!pass) {
            log.debug(`Event-driven skip (condition): ${binding.flowPath} on ${payload.notePath}`);
            results.push(DispatchResult.SKIP_CONDITION);
            continue;
        }

        if (!deps.throttle.shouldFire(throttleKey(binding, payload), deps.now())) {
            log.debug(`Event-driven skip (throttled): ${binding.flowPath} on ${payload.notePath}`);
            results.push(DispatchResult.SKIP_THROTTLED);
            continue;
        }

        deps.cascade.enter(payload.notePath);
        try {
            await deps.runWorkflow(binding, payload);
            log.info(`Event-driven fire: ${binding.flowPath} on ${payload.event} (${payload.notePath})`);
            results.push(DispatchResult.FIRED);
        } finally {
            deps.cascade.exit(payload.notePath);
        }
    }
    return results;
}

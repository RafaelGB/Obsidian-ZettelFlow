import { log } from "architecture/monitoring/Logger";
import type { Action, ExecuteInfo } from "architecture/api";

/** The shared execution context an on-creation action needs — the note being built (#170). */
export type OnCreationContext = Pick<ExecuteInfo, "content" | "note" | "context">;

/** Resolves a registered action implementation for a type (e.g. the `ActionsStore`). */
export type ActionLookup = (
    type: string
) => { execute(info: ExecuteInfo): void | Promise<void>; category?: string } | undefined;

/** Options for {@link runOnCreationActions}. */
export interface RunOnCreationOptions {
    /** Action categories to skip (e.g. `["ai"]` on the post-index re-run, so AI never double-fires — #301 S2). */
    skipCategories?: string[];
}

/**
 * Run a Knowledge Pattern's on-creation actions (#170) in declared order, reusing the standard
 * `execute(info)` pipeline. Best-effort: each action is wrapped so one failure is logged and never
 * aborts the build or the remaining actions (mirrors `KnowledgeIndex.recordDevelopment`). An action
 * the lookup can't resolve is skipped when the lookup returns undefined (e.g. an injected/test store);
 * the production `ActionsStore` throws instead, which the same per-action catch absorbs.
 */
export async function runOnCreationActions(
    actions: Action[],
    ctx: OnCreationContext,
    getAction: ActionLookup,
    options: RunOnCreationOptions = {}
): Promise<void> {
    const skip = new Set(options.skipCategories ?? []);
    for (const action of actions) {
        try {
            const impl = getAction(action.type);
            if (!impl) continue;
            if (impl.category && skip.has(impl.category)) continue;
            await impl.execute({
                element: { ...action, result: null },
                content: ctx.content,
                note: ctx.note,
                context: ctx.context,
                // Headless pattern run — cognitive actions suppress their success Notice (#201).
                silent: true,
            });
        } catch (error) {
            log.error(
                `[patterns] on-creation action "${action.type}" failed: ${error instanceof Error ? error.message : "unknown error"}`
            );
        }
    }
}

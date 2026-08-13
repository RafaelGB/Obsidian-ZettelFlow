import { log } from "architecture/monitoring/Logger";
import type { Action, ExecuteInfo } from "architecture/api";

/** The shared execution context an on-creation action needs — the note being built (#170). */
export type OnCreationContext = Pick<ExecuteInfo, "content" | "note" | "context">;

/** Resolves a registered action implementation for a type (e.g. the `ActionsStore`). */
export type ActionLookup = (type: string) => { execute(info: ExecuteInfo): void | Promise<void> } | undefined;

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
    getAction: ActionLookup
): Promise<void> {
    for (const action of actions) {
        try {
            const impl = getAction(action.type);
            if (!impl) continue;
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

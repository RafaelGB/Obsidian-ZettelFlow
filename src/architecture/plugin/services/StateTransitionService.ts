import { Notice } from "obsidian";
import { log } from "architecture";
import { t } from "architecture/lang";
import type { Literal } from "../model/FrontmatterModel";
import {
    LifecycleState,
    LifecycleStateSchema,
    STATE_EMOJI,
    STATE_LABEL_KEY,
    canTransition,
} from "architecture/knowledge/lifecycle";

/**
 * The minimal frontmatter surface the transition needs. `FrontmatterService` satisfies it, and
 * tests inject a fake so the write is facade-spy testable in the node env.
 */
export interface FrontmatterAccessor {
    getProperty(property: string): Literal;
    setProperty(property: string, value: Literal): Promise<void>;
}

function displayLabel(state: LifecycleState): string {
    return `${STATE_EMOJI[state]} ${t(STATE_LABEL_KEY[state])}`;
}

/**
 * The single write in the Knowledge layer (#146): move a note between lifecycle states. Validates
 * the target against the pure state machine and, on success, writes ONLY the configured state
 * property; on rejection it performs no write. Both branches surface a Notice + a `log` line.
 */
export class StateTransitionService {
    private static singleton: StateTransitionService;

    public static getInstance(): StateTransitionService {
        if (!StateTransitionService.singleton) {
            StateTransitionService.singleton = new StateTransitionService();
        }
        return StateTransitionService.singleton;
    }

    public async transition(
        accessor: FrontmatterAccessor,
        stateProperty: string,
        schema: LifecycleStateSchema,
        target: LifecycleState,
        fileLabel: string
    ): Promise<boolean> {
        const current = schema.parse({ [stateProperty]: accessor.getProperty(stateProperty) }) as LifecycleState;

        if (!canTransition(current, target)) {
            new Notice(t("state_transition_rejected", displayLabel(current), displayLabel(target)));
            log.warn(`[Lifecycle] rejected transition ${current} -> ${target} (${fileLabel})`);
            return false;
        }

        try {
            await accessor.setProperty(stateProperty, target);
            new Notice(t("state_transition_success", displayLabel(target)));
            log.info(`[Lifecycle] ${fileLabel}: ${current} -> ${target}`);
            return true;
        } catch (error) {
            new Notice(t("state_transition_error"));
            log.error(`[Lifecycle] transition failed (${fileLabel}): ${String(error)}`);
            return false;
        }
    }
}

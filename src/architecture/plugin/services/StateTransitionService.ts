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
    stateSubject,
} from "architecture/knowledge/lifecycle";
import type { JudgementOrigin } from "architecture/knowledge/judgement";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";

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
 *
 * Since #581 a successful transition also records **one judgement**. It belongs here rather than at
 * either door for the reason every choke point exists: a future door cannot forget it. What it
 * cannot guess is **which act it was**, so `origin` is a required parameter — accepting the next
 * state Cultivate proposed (`derived`) and choosing a state yourself from the palette (`human`) are
 * not the same thing, and the agency review reads interpretive origins on purpose.
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
        path: string,
        origin: JudgementOrigin
    ): Promise<boolean> {
        const current = schema.parse({ [stateProperty]: accessor.getProperty(stateProperty) }) as LifecycleState;

        if (!canTransition(current, target)) {
            new Notice(t("state_transition_rejected", displayLabel(current), displayLabel(target)));
            log.warn(`[Lifecycle] rejected transition ${current} -> ${target} (${path})`);
            return false;
        }

        try {
            await accessor.setProperty(stateProperty, target);
            // A human decided this note is now that. Recorded on the success branch only: a refused
            // transition is not a decision, it is a no-op (§XII, and the record holds no label).
            JudgementLog.getInstance().record({
                path,
                subject: stateSubject(target),
                origin,
                verdict: "accepted",
            });
            new Notice(t("state_transition_success", displayLabel(target)));
            log.info(`[Lifecycle] ${path}: ${current} -> ${target}`);
            return true;
        } catch (error) {
            new Notice(t("state_transition_error"));
            log.error(`[Lifecycle] transition failed (${path}): ${String(error)}`);
            return false;
        }
    }
}

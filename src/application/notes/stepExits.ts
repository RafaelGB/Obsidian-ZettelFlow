import { EvalContext, evaluateEdgeGate, parseEdgeCondition } from "./conditionEvaluator";
import { describeOption } from "./optionDescription";
import { explainClosedBranch, type HiddenBranch } from "./branchVisibility";

/**
 * A step owns its **exits** (#427, epic #422) — pure.
 *
 * A canvas edge carries one field, its label, and ZettelFlow made it do three jobs at once: draw
 * the transition, store the `if:` gate, and describe the option to the person writing a note. They
 * conflict — writing a condition defaces the diagram and (since #409) printed an expression at the
 * user, which #423 patched at the display boundary. There was also no way to say the obvious
 * things: in what **order** the options appear, and which one is the **default**.
 *
 * So the transition becomes configuration on the source step, keyed by canvas edge id, and stored
 * in our own settings — the `.canvas` file stays a plain canvas file.
 *
 * Legacy is not a branch in the code: an edge with no exit config falls back to its label, which is
 * exactly today's behaviour, so the fallback path *is* the regression test.
 */

export interface StepExit {
    /** What the option reads like in the wizard. */
    says?: string;
    /** The gate; absent or blank means always open. */
    when?: string;
    /** Position among the step's options; unordered exits keep canvas order, after ordered ones. */
    order?: number;
    /** At most one per step: the option a keyboard user lands on. */
    default?: boolean;
}

export type StepExits = Record<string, StepExit>;

/** The shape `Flows.childrensOf` already produces for a child. */
export interface ExitCandidate {
    /** The destination node id. */
    id: string;
    label: string;
    /** The raw edge label — gate and description, until this issue separates them. */
    tooltip?: string;
    /** The canvas edge this child came through, when it came through one. */
    edgeId?: string;
}

export interface ResolvedExit<T extends ExitCandidate> {
    candidate: T;
    /** What the wizard shows as the description, or nothing. */
    says?: string;
    /** Open after evaluating the gate. */
    open: boolean;
    /** The gate could not be parsed; it safe-opens and the author is told (#119). */
    invalid: boolean;
    /** The gate that was evaluated, for the hidden-branch explanation (#414). */
    expression?: string;
    isDefault: boolean;
}

/** One exit's configuration, with the legacy label as the fallback for both of its jobs. */
function exitFor<T extends ExitCandidate>(candidate: T, exits: StepExits): StepExit {
    const configured = candidate.edgeId ? exits[candidate.edgeId] : undefined;
    if (configured) return configured;
    // No configuration: the label is still the gate and still the description, as it always was.
    return {
        says: describeOption(candidate.tooltip),
        when: parseEdgeCondition(candidate.tooltip),
    };
}

/**
 * The step's children in the order the person will read them: exits with a declared `order` come
 * first, by it; the rest keep canvas order behind them, so ordering one branch does not scramble
 * the others.
 */
export function orderExits<T extends ExitCandidate>(candidates: T[], exits: StepExits): T[] {
    return candidates
        .map((candidate, index) => ({
            candidate,
            index,
            order: candidate.edgeId ? exits[candidate.edgeId]?.order : undefined,
        }))
        .sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return a.index - b.index;
        })
        .map((entry) => entry.candidate);
}

/**
 * Move one exit one place up (`-1`) or down (`+1`), writing the resulting order onto **every**
 * exit. Ordering half a list leaves an arrangement nobody can predict, so a single move settles the
 * whole sequence — what the editor shows is what the wizard shows.
 */
export function moveExit(
    candidates: ExitCandidate[],
    exits: StepExits,
    edgeId: string,
    delta: number
): StepExits {
    const ordered = orderExits(candidates, exits).filter((candidate) => candidate.edgeId);
    const from = ordered.findIndex((candidate) => candidate.edgeId === edgeId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ordered.length) return exits;

    const moved = [...ordered];
    [moved[from], moved[to]] = [moved[to], moved[from]];

    const next: StepExits = { ...exits };
    moved.forEach((candidate, position) => {
        const id = candidate.edgeId as string;
        next[id] = { ...next[id], order: position + 1 };
    });
    return next;
}

/** Resolve a step's children into ordered, described, gated options. */
export function resolveExits<T extends ExitCandidate>(
    candidates: T[],
    exits: StepExits,
    context: EvalContext
): ResolvedExit<T>[] {
    return orderExits(candidates, exits).map((candidate) => {
        const exit = exitFor(candidate, exits);
        const when = exit.when?.trim();
        // The gate is evaluated by the #119 evaluator, through the same entry point the wizard used
        // when the condition lived in the label — one parser, one behaviour, including safe-open.
        const gate = when ? evaluateEdgeGate(`if: ${when}`, context) : { open: true, invalid: false };
        return {
            candidate,
            ...(exit.says ? { says: exit.says } : {}),
            open: gate.open,
            invalid: gate.invalid,
            ...(when ? { expression: when } : {}),
            isDefault: exit.default === true,
        };
    });
}

export interface ExitPartition<T extends ExitCandidate> {
    /** Options the user can pick, in exit order — open gates and safe-opened malformed ones. */
    visible: Array<T & { says?: string; isDefault?: boolean }>;
    /** Options a closed gate removed, with the reason (#414). */
    hidden: HiddenBranch[];
    /** Labels of branches shown *despite* a malformed expression (the author has a defect). */
    invalid: string[];
}

/**
 * What the wizard shows, what it hides and why — the single place a step's children become options.
 * It replaced `partitionBranches` (#414) rather than sitting beside it: two resolutions of the same
 * question is exactly how a label and a configuration drift apart.
 */
export function partitionExits<T extends ExitCandidate>(
    children: T[],
    exits: StepExits,
    context: EvalContext
): ExitPartition<T> {
    const partition: ExitPartition<T> = { visible: [], hidden: [], invalid: [] };
    for (const { candidate, says, open, invalid, expression, isDefault } of resolveExits(
        children,
        exits,
        context
    )) {
        if (invalid) partition.invalid.push(candidate.label);
        if (open) {
            partition.visible.push({ ...candidate, says, isDefault });
            continue;
        }
        partition.hidden.push({
            id: candidate.id,
            label: candidate.label,
            expression: expression ?? "",
            reason: explainClosedBranch(expression ?? "", context),
        });
    }
    return partition;
}

/** At most one default: setting a new one clears the rest, rather than leaving two truths. */
export function setDefaultExit(exits: StepExits, edgeId: string): StepExits {
    const next: StepExits = {};
    for (const [id, exit] of Object.entries(exits)) {
        const { default: _wasDefault, ...rest } = exit;
        next[id] = id === edgeId ? { ...rest, default: true } : rest;
    }
    if (!next[edgeId]) next[edgeId] = { default: true };
    return next;
}

/** An exit whose edge is gone is dropped: a deleted arrow is not an error. */
export function pruneExits(exits: StepExits, edgeIds: string[]): StepExits {
    const alive = new Set(edgeIds);
    const next: StepExits = {};
    for (const [id, exit] of Object.entries(exits)) {
        if (alive.has(id)) next[id] = exit;
    }
    return next;
}

export interface MigrationStep {
    edgeId: string;
    /** What the canvas label becomes — the human half, or empty when the label was only a gate. */
    label: string;
    exit: StepExit;
}

/**
 * Move an edge's label into configuration: the human half stays on the canvas, the gate moves into
 * the step. Idempotent — running it on an already-migrated flow proposes nothing.
 */
export function planMigration(candidates: ExitCandidate[], exits: StepExits): MigrationStep[] {
    const plan: MigrationStep[] = [];
    for (const candidate of candidates) {
        if (!candidate.edgeId || exits[candidate.edgeId]) continue;
        const when = parseEdgeCondition(candidate.tooltip);
        const says = describeOption(candidate.tooltip);
        // Nothing to move: no gate and no text.
        if (!when && !says) continue;
        plan.push({
            edgeId: candidate.edgeId,
            label: says ?? "",
            exit: {
                ...(says ? { says } : {}),
                ...(when ? { when } : {}),
            },
        });
    }
    return plan;
}

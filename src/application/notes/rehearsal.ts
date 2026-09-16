import type { EvalContext } from "./conditionEvaluator";
import type { HiddenBranch } from "./branchVisibility";
import { partitionExits, type ExitCandidate, type StepExits } from "./stepExits";
import { assembleNotePreview, type NotePreview, type PreviewTemplate } from "./previewAssembly";

/**
 * **Rehearse the flow** (#430, epic #422) — pure, and writeless by construction.
 *
 * The only way to find out what a flow did was to run it on a real note: authors tested by making
 * throwaway notes and deleting them, which is why half-finished flows ship and why a branch that
 * can never open survives for months.
 *
 * Everything needed to answer *"what would happen?"* already existed and was pure — the condition
 * evaluator (#119), the branch partition and its explanations (#414), the exits (#427), the note
 * assembly (#412). This composes them into a walk. It **imports no writer**, and a guardrail test
 * asserts it: not the vault, not Obsidian, not a store.
 */

/** A step as the rehearsal needs it; the runtime resolves settings and template bodies. */
export interface RehearsalStep {
    id: string;
    label: string;
    root?: boolean;
    /** What the step would ask and do — described, never executed (FR-7). */
    actions?: { type?: string; description?: string; hasUI?: boolean }[];
    /** The template this step contributes, already read. */
    template?: PreviewTemplate;
    /** A linked note this step declares (#419). */
    satellite?: { template?: string; title?: string };
    targetFolder?: string;
    /** The step pauses for a human (#151). */
    wait?: unknown;
    exits?: StepExits;
}

export interface RehearsalEdge {
    id: string;
    fromNode: string;
    toNode: string;
    /** The words the option reads, when the exit or the label says any. */
    says?: string;
}

export interface RehearsalFlow {
    steps: RehearsalStep[];
    edges: RehearsalEdge[];
}

/** An option the rehearsal can take, or one it cannot and why. */
export interface RehearsalOption {
    stepId: string;
    label: string;
    says?: string;
}

/** Something the real run would do here, stated rather than done. */
export interface WouldRun {
    stepId: string;
    stepLabel: string;
    /** The action's type, or `wait` for a human pause. */
    type: string;
    /** What the author wrote about it, when they wrote anything. */
    description?: string;
    /** Whether it would stop and ask, as opposed to running in the background. */
    asks: boolean;
}

export interface RehearsalState {
    /** The steps walked, in order — the path traced on the canvas. */
    path: string[];
    /** Where the rehearsal stands. */
    currentId: string | undefined;
    /** What it can take from here. */
    options: RehearsalOption[];
    /** What it cannot take from here, with #414's own explanation. */
    closed: HiddenBranch[];
    /** Everything the real run would do along this path. */
    wouldRun: WouldRun[];
    /** No options left: the flow would build the note now. */
    done: boolean;
}

function stepOf(flow: RehearsalFlow, id: string | undefined): RehearsalStep | undefined {
    return flow.steps.find((step) => step.id === id);
}

/** What a step would do, described in the order the run would do it. */
function wouldRunAt(step: RehearsalStep): WouldRun[] {
    const entries: WouldRun[] = (step.actions ?? []).map((action) => ({
        stepId: step.id,
        stepLabel: step.label,
        type: action.type ?? "",
        ...(action.description ? { description: action.description } : {}),
        asks: action.hasUI === true,
    }));
    if (step.wait) {
        entries.push({ stepId: step.id, stepLabel: step.label, type: "wait", asks: true });
    }
    return entries;
}

/** The options leaving a step, resolved exactly as the wizard resolves them (#427, #414). */
function optionsAt(
    flow: RehearsalFlow,
    step: RehearsalStep,
    context: EvalContext
): Pick<RehearsalState, "options" | "closed"> {
    const candidates: (ExitCandidate & { destination: RehearsalStep | undefined })[] = flow.edges
        .filter((edge) => edge.fromNode === step.id)
        .map((edge) => {
            const destination = stepOf(flow, edge.toNode);
            return {
                id: edge.toNode,
                label: destination?.label ?? edge.toNode,
                edgeId: edge.id,
                ...(edge.says ? { tooltip: edge.says } : {}),
                destination,
            };
        });

    const { visible, hidden } = partitionExits(candidates, step.exits ?? {}, context);
    return {
        options: visible.map((candidate) => ({
            stepId: candidate.id,
            label: candidate.label,
            ...(candidate.says ? { says: candidate.says } : {}),
        })),
        closed: hidden,
    };
}

function at(flow: RehearsalFlow, step: RehearsalStep, context: EvalContext, path: string[], wouldRun: WouldRun[]): RehearsalState {
    const { options, closed } = optionsAt(flow, step, context);
    return {
        path,
        currentId: step.id,
        options,
        closed,
        wouldRun,
        done: options.length === 0,
    };
}

/**
 * Stand at the flow's start. `rootId` picks one when the flow declares several; otherwise the first
 * root is taken, and a flow with no root has nothing to rehearse.
 */
export function startRehearsal(
    flow: RehearsalFlow,
    context: EvalContext,
    rootId?: string
): RehearsalState | undefined {
    const root = rootId ? stepOf(flow, rootId) : flow.steps.find((step) => step.root);
    if (!root) return undefined;
    return at(flow, root, context, [root.id], wouldRunAt(root));
}

/** Take one option. An option that is not on offer leaves the rehearsal exactly where it was. */
export function advanceRehearsal(
    flow: RehearsalFlow,
    context: EvalContext,
    state: RehearsalState,
    chosenId: string
): RehearsalState {
    if (!state.options.some((option) => option.stepId === chosenId)) return state;
    const next = stepOf(flow, chosenId);
    if (!next) return state;
    return at(
        flow,
        next,
        context,
        [...state.path, next.id],
        [...state.wouldRun, ...wouldRunAt(next)]
    );
}

export interface RehearsalOutcome {
    preview: NotePreview;
    /** Linked notes the walked steps declare (#419) — named, not created. */
    satellites: { template?: string; title?: string; stepLabel: string }[];
    /** Where the note would be filed: the last walked step that names a folder wins, as in the run. */
    targetFolder?: string;
}

/**
 * What the walk would have produced: the merged note, the linked notes it would also create and
 * where it would be filed. No action results are folded in — nothing ran — so this is the flow's
 * own contribution, which is exactly the question an author is asking.
 */
export function rehearsalOutcome(
    flow: RehearsalFlow,
    state: RehearsalState,
    context: EvalContext,
    title = ""
): RehearsalOutcome {
    const walked = state.path
        .map((id) => stepOf(flow, id))
        .filter((step): step is RehearsalStep => Boolean(step));

    const preview = assembleNotePreview({
        title,
        templates: walked
            .map((step) => step.template)
            .filter((template): template is PreviewTemplate => Boolean(template)),
        elements: [],
        sourceFrontmatter: context.frontmatter,
        canvasName: context.canvasName,
    });

    const satellites = walked
        .filter((step) => step.satellite)
        .map((step) => ({
            ...(step.satellite?.template ? { template: step.satellite.template } : {}),
            ...(step.satellite?.title ? { title: step.satellite.title } : {}),
            stepLabel: step.label,
        }));

    const targetFolder = walked
        .map((step) => step.targetFolder?.trim())
        .filter((folder): folder is string => Boolean(folder))
        .pop();

    return { preview, satellites, ...(targetFolder ? { targetFolder } : {}) };
}

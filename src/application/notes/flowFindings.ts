/**
 * What is **recorded** about a flow, read back as facts (#428, epic #422) — pure.
 *
 * Nothing about a flow is checked until it runs. A flow can be saved, shared as a system and
 * installed by someone else while a file step points at a deleted note (which throws mid-wizard),
 * while steps are unreachable, while two sibling options read identically, or while a gate waits on
 * a key nothing in the flow ever writes.
 *
 * Every finding here is a **structural fact about the recorded graph**, never a judgement: no
 * score, no ranking, no "quality". It states what is recorded and what that implies, and it never
 * edits anything — a guardrail test asserts this module imports no writer (AC-6).
 */

/** A step as the finder needs it: the runtime resolves settings and file existence, this reads. */
export interface FlowStepShape {
    id: string;
    /** What to call it in a finding. */
    label?: string;
    kind: "text" | "group" | "file" | "script" | "unknown";
    /** For a file step, the note it points at. */
    path?: string;
    /** The runtime looked it up and found nothing. */
    missing?: boolean;
    root?: boolean;
    /** Frontmatter keys this step's actions declare — what the flow itself writes. */
    writesKeys?: string[];
    /** How many questions it asks. */
    asks?: number;
    /** Whether it contributes a body. */
    hasTemplate?: boolean;
    /** Whether it sends the note somewhere. */
    hasTarget?: boolean;
}

/** An arrow, with the gate and the words already resolved by the caller (#427). */
export interface FlowEdgeShape {
    id: string;
    fromNode: string;
    toNode: string;
    /** The gate, wherever it lives now. */
    when?: string;
    /** What the option reads like. */
    says?: string;
}

export interface FlowShape {
    steps: FlowStepShape[];
    edges: FlowEdgeShape[];
    /** Children per node, including group containment — `flowAdjacency` (#408) builds this. */
    adjacency: Map<string, string[]>;
}

export type FlowFindingKind =
    | "missing-note"
    | "no-root"
    | "several-roots"
    | "unreachable"
    | "dead-end"
    | "duplicate-option"
    | "gate-unknown-key";

export interface FlowFinding {
    kind: FlowFindingKind;
    /** The node this is about; absent for a finding about the flow as a whole. */
    nodeId?: string;
    /** What to call that node (or the flow) in the panel. */
    subject?: string;
    /** i18n key of the sentence. Literal per kind, so the key map cannot rot (#320). */
    messageKey: string;
    /** The one variable part: a path, a key, a count, a repeated option. */
    detail?: string;
}

/** i18n key per finding. Pure data; the panel does the `t()` lookup. */
export const FINDING_MESSAGE_KEY: Record<FlowFindingKind, string> = {
    "missing-note": "flow_finding_missing_note",
    "no-root": "flow_finding_no_root",
    "several-roots": "flow_finding_several_roots",
    unreachable: "flow_finding_unreachable",
    "dead-end": "flow_finding_dead_end",
    "duplicate-option": "flow_finding_duplicate_option",
    "gate-unknown-key": "flow_finding_gate_unknown_key",
};

const FRONTMATTER_KEY = /frontmatter\.([A-Za-z_$][\w$]*)/g;

/** Every step reachable from the roots, following the same adjacency the wizard walks. */
function reachableFrom(roots: string[], adjacency: Map<string, string[]>): Set<string> {
    const seen = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const child of adjacency.get(current) ?? []) {
            if (seen.has(child)) continue;
            seen.add(child);
            queue.push(child);
        }
    }
    return seen;
}

function named(step: FlowStepShape | undefined): string | undefined {
    return step?.label?.trim() || step?.path?.split("/").pop();
}

/**
 * Read a flow and report what is recorded. Order is the order the panel shows: what will break at
 * run time first, then what the flow cannot do, then what a person will find confusing.
 */
export function flowFindings(flow: FlowShape): FlowFinding[] {
    const findings: FlowFinding[] = [];
    const byId = new Map(flow.steps.map((step) => [step.id, step]));
    const finding = (kind: FlowFindingKind, step?: FlowStepShape, detail?: string): FlowFinding => ({
        kind,
        ...(step ? { nodeId: step.id } : {}),
        ...(named(step) ? { subject: named(step) } : {}),
        messageKey: FINDING_MESSAGE_KEY[kind],
        ...(detail ? { detail } : {}),
    });

    // 1 — the one that throws mid-wizard.
    for (const step of flow.steps) {
        if (step.kind === "file" && step.missing) {
            findings.push(finding("missing-note", step, step.path));
        }
    }

    // 2 — can the flow start at all?
    const roots = flow.steps.filter((step) => step.root);
    if (roots.length === 0) {
        findings.push(finding("no-root"));
    } else if (roots.length > 1) {
        // Legitimate — several entry points is a design — but worth knowing.
        findings.push(finding("several-roots", undefined, String(roots.length)));
    }

    // 3 — what the flow can never reach. With no root everything is unreachable, and saying so
    // seventeen times would bury the one finding that matters.
    if (roots.length > 0) {
        const reachable = reachableFrom(
            roots.map((step) => step.id),
            flow.adjacency
        );
        for (const step of flow.steps) {
            if (!reachable.has(step.id)) findings.push(finding("unreachable", step));
        }
    }

    // 4 — a step that ends the flow without contributing anything to the note.
    for (const step of flow.steps) {
        const children = flow.adjacency.get(step.id) ?? [];
        const contributes = (step.asks ?? 0) > 0 || step.hasTemplate || step.hasTarget;
        if (children.length === 0 && !contributes && step.kind !== "script") {
            findings.push(finding("dead-end", step));
        }
    }

    // 5 — two options that read the same: the person picks blind.
    for (const step of flow.steps) {
        const outgoing = flow.edges.filter((edge) => edge.fromNode === step.id);
        const seen = new Map<string, number>();
        for (const edge of outgoing) {
            const reads = (edge.says?.trim() || named(byId.get(edge.toNode)) || "").toLowerCase();
            if (!reads) continue;
            seen.set(reads, (seen.get(reads) ?? 0) + 1);
        }
        for (const [reads, count] of seen) {
            if (count > 1) findings.push(finding("duplicate-option", step, reads));
        }
    }

    // 6 — a gate waiting on a key nothing in this flow writes. It can still arrive from the note
    // you start on, which is what the sentence says: a fact, not a verdict.
    const written = new Set(flow.steps.flatMap((step) => step.writesKeys ?? []));
    for (const edge of flow.edges) {
        if (!edge.when?.trim()) continue;
        const keys = new Set([...edge.when.matchAll(FRONTMATTER_KEY)].map((match) => match[1]));
        for (const key of keys) {
            if (written.has(key)) continue;
            findings.push(finding("gate-unknown-key", byId.get(edge.fromNode), key));
        }
    }

    return findings;
}

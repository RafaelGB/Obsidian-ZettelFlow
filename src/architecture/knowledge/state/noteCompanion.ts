import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { isNoteNeighbour } from "./neighbourhood";
import type { EvidenceEntry, EvidenceMap, UnsourcedClaim } from "architecture/knowledge/synthesis/evidenceMap";
import {
    LIFECYCLE_STATES,
    STATE_LABEL_KEY,
    isLifecycleState,
    type LifecycleState,
} from "architecture/knowledge/lifecycle/states";

/**
 * What the **This note** companion shows (#640, epic #639) — pure projections, so every block of the
 * view renders from data a test can build without a vault.
 *
 * Nothing here judges the note. The vital signs are counts, the stepper says where the note is and
 * the sections say what surrounds it; there is no score, band or percentage (D3, §XII).
 */

/** Four counts you can read at a glance. A zero is a fact, not a failing. */
export interface NoteVitals {
    linksIn: number;
    linksOut: number;
    claims: number;
    sources: number;
}

export function noteVitals(model: KnowledgeModel, path: string): NoteVitals {
    const idea = model.get(path);
    if (!idea) return { linksIn: 0, linksOut: 0, claims: 0, sources: 0 };
    // A source cited by two claims is still one source.
    const sources = new Set<string>();
    for (const claim of idea.claims) for (const source of claim.sources) sources.add(source.ref);
    // Counted through the neighbourhood's own test (#643 FR-10): only other notes, never a self-link,
    // an unresolved target or an attachment — so the header and the neighbourhood's list agree.
    let linksIn = 0;
    for (const from of model.inNeighborSet(path)) if (isNoteNeighbour(model, path, from)) linksIn++;
    let linksOut = 0;
    for (const to of model.outNeighborSet(path)) if (isNoteNeighbour(model, path, to)) linksOut++;
    return {
        linksIn,
        linksOut,
        claims: idea.claims.length,
        sources: sources.size,
    };
}

export type StepStatus = "done" | "current" | "todo";

export interface LifecycleStep {
    state: LifecycleState;
    labelKey: (typeof STATE_LABEL_KEY)[LifecycleState];
    status: StepStatus;
}

/** The line every note walks; the later states only appear once a note has reached them. */
const BASE_LINE: readonly LifecycleState[] = ["fleeting", "literature", "permanent"];

/**
 * Where the note stands on its lifecycle (#146), as steps.
 *
 * `recognised` exists because the model reads a missing or unknown state as `fleeting` (decision #1
 * of #146): a note that never stated one must not be drawn as if it had. Archived is off the line,
 * so it has no current step either.
 */
export function lifecycleStepper(state: string, recognised: boolean): { steps: LifecycleStep[] } {
    const known = recognised && isLifecycleState(state) && state !== "archived" ? state : null;
    const beyond = known !== null && !BASE_LINE.includes(known);
    const line = beyond ? LIFECYCLE_STATES.slice(0, LIFECYCLE_STATES.indexOf(known) + 1) : BASE_LINE;
    const at = known === null ? -1 : line.indexOf(known);
    return {
        steps: line.map((step, index) => ({
            state: step,
            labelKey: STATE_LABEL_KEY[step],
            status: at < 0 ? "todo" : index < at ? "done" : index === at ? "current" : "todo",
        })),
    };
}

export type CompanionSectionId = "tension" | "supports" | "gaps" | "nearby";

/** The fixed order the sections are read in: what argues with it first, what you forgot last. */
export const COMPANION_SECTION_ORDER: readonly CompanionSectionId[] = ["tension", "supports", "gaps", "nearby"];

/** A nearby note as the resurface ranking returns it; generic so State never imports `application`. */
export interface NearbyRow<R = unknown> {
    path: string;
    basename: string;
    reasons: readonly R[];
}

export type CompanionSection<R = unknown> =
    | { id: "tension"; count: number; notes: string[] }
    | { id: "supports"; count: number; notes: string[]; evidence: EvidenceEntry[] }
    | { id: "gaps"; count: number; unsourcedClaims: UnsourcedClaim[]; openQuestions: string[] }
    | { id: "nearby"; count: number; rows: readonly NearbyRow<R>[] };

export interface CompanionSections<R = unknown> {
    /** The sections with something in them, in {@link COMPANION_SECTION_ORDER}. */
    sections: CompanionSection<R>[];
    /** The empty ones — said once, on one quiet line, instead of four empty boxes. */
    folded: CompanionSectionId[];
}

/**
 * The sections around a note, built from the **same** evidence map and resurface ranking the old
 * Timeline mode mounted (FR-12): this re-shapes their output and computes nothing new.
 * Sourced evidence sits inside *Supports* — a source supports a claim.
 */
export function companionSections<R>(map: EvidenceMap | null, nearby: readonly NearbyRow<R>[]): CompanionSections<R> {
    const all: CompanionSection<R>[] = [
        { id: "tension", count: map?.contradicts.length ?? 0, notes: map?.contradicts ?? [] },
        {
            id: "supports",
            count: (map?.supports.length ?? 0) + (map?.evidence.length ?? 0),
            notes: map?.supports ?? [],
            evidence: map?.evidence ?? [],
        },
        {
            id: "gaps",
            count: (map?.gaps.unsourcedClaims.length ?? 0) + (map?.gaps.openQuestions.length ?? 0),
            unsourcedClaims: map?.gaps.unsourcedClaims ?? [],
            openQuestions: map?.gaps.openQuestions ?? [],
        },
        { id: "nearby", count: nearby.length, rows: nearby },
    ];
    return {
        sections: all.filter((section) => section.count > 0),
        folded: all.filter((section) => section.count === 0).map((section) => section.id),
    };
}

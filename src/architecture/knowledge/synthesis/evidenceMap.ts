import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { Source } from "../model/Idea";
import { incomingRelations, outgoingRelations } from "../query/queries";
import { findContradictions } from "architecture/knowledge/query/findContradictionLogic";
import { findUnansweredQuestions } from "actions/findUnansweredQuestion/findUnansweredQuestionLogic";

/** The relation that backs a position (#147). */
const SUPPORTS = "supports";

/** A sourced claim backing the position — grounded to a real note + a real source (#169). */
export interface EvidenceEntry {
    note: string;
    claim: string;
    source: Source;
}

/** A claim on the focus with no source — a hole in the evidence (#169). */
export interface UnsourcedClaim {
    note: string;
    claim: string;
}

/**
 * A transparent, grounded synthesis of a note reconstructed only from the graph (#169): which notes
 * support it, which contradict it, the sourced evidence, and the gaps. Every path is an existing note.
 */
export interface EvidenceMap {
    focus: string;
    supports: string[];
    contradicts: string[];
    evidence: EvidenceEntry[];
    gaps: {
        unsourcedClaims: UnsourcedClaim[];
        openQuestions: string[];
    };
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** The notes connected to `focus` by a `supports` edge in either direction — the ideas backing it. */
function supportNeighbours(model: KnowledgeModel, focus: string): string[] {
    const partners = [
        ...outgoingRelations(model, focus, SUPPORTS).map((relation) => relation.to),
        ...incomingRelations(model, focus, SUPPORTS).map((relation) => relation.from),
    ];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const partner of partners) {
        if (partner === focus || seen.has(partner)) continue;
        seen.add(partner);
        unique.push(partner);
    }
    return unique.sort(compareStrings);
}

/**
 * Pure "compound thinking" synthesis (#169, FR-1..FR-7, experimental). Composes existing primitives
 * into four grounded buckets for `path`:
 * - `supports` — the in+out `supports` neighbours (#147);
 * - `contradicts` — `findContradictions` (#153);
 * - `evidence` — the **sourced** claims (#148) on the focus and its `supports` neighbours (unsourced
 *   claims are never emitted here — that's the "no unsourced claims" rule);
 * - `gaps` — the focus's unsourced claims + its unanswered `question`s (#153).
 *
 * Every emitted note path exists in the model (`source.ref` is a citation, which may be a URL/DOI).
 * An unknown/unindexed focus yields an empty map. Deterministic, read-only, never throws. Obsidian-free.
 */
export function buildEvidenceMap(model: KnowledgeModel, path: string): EvidenceMap {
    const focusIdea = model.get(path);
    if (!focusIdea) {
        return { focus: path, supports: [], contradicts: [], evidence: [], gaps: { unsourcedClaims: [], openQuestions: [] } };
    }

    const supports = supportNeighbours(model, path);

    const evidence: EvidenceEntry[] = [];
    const seen = new Set<string>();
    for (const note of [path, ...supports]) {
        const idea = model.get(note);
        if (!idea) continue;
        for (const claim of idea.claims) {
            for (const source of claim.sources) {
                const key = `${note}\u0000${claim.text}\u0000${source.ref}`;
                if (seen.has(key)) continue;
                seen.add(key);
                evidence.push({ note, claim: claim.text, source });
            }
        }
    }
    evidence.sort(
        (a, b) =>
            compareStrings(a.note, b.note) ||
            compareStrings(a.claim, b.claim) ||
            compareStrings(a.source.ref, b.source.ref)
    );

    const unsourcedClaims: UnsourcedClaim[] = focusIdea.claims
        .filter((claim) => claim.sources.length === 0)
        .map((claim) => ({ note: path, claim: claim.text }))
        .sort((a, b) => compareStrings(a.claim, b.claim));

    return {
        focus: path,
        supports,
        contradicts: findContradictions(model, path),
        evidence,
        gaps: { unsourcedClaims, openQuestions: findUnansweredQuestions(model, path) },
    };
}

import type { KnowledgeModel } from '../model/KnowledgeModel';
import type { Relation } from '../model/Idea';
import { isPathExcluded } from '../scope/knowledgeScope';
import type { Inquiry } from './inquiryState';

export interface InquiryContext {
    materials: { path: string; selected: boolean }[];
    candidates: { path: string; reason: Relation }[];
    relations: Relation[];
    evidence: { path: string; claim: string; source: string }[];
    unavailable: { path: string; reason: 'missing' | 'excluded' }[];
    inspected: number;
    truncated: boolean;
    method: 'selected' | 'neighbors';
}

/** Bounded indexed context, not semantic search or a verdict. No full-vault ranking or body reads. */
export function buildInquiryContext(model: KnowledgeModel, q: Inquiry, excludedPaths: readonly string[] = []): InquiryContext {
    const result: InquiryContext = { materials: [], candidates: [], relations: [], evidence: [], unavailable: [], inspected: 0, truncated: false, method: q.scope };
    const allowed = (path: string) => !isPathExcluded(path, excludedPaths) && !q.missingPaths.includes(path);
    const spend = () => {
        if (result.inspected >= 1000) { result.truncated = true; return false; }
        result.inspected++;
        return true;
    };
    const seeds = new Set(q.selectedPaths.slice(0, 20));
    const material = new Set<string>();
    const reasons = new Map<string, Relation>();
    const edges: Relation[] = [];
    const edgeKeys = new Set<string>();
    const addMaterial = (path: string) => {
        if (!allowed(path) || !model.get(path)) return;
        if (!material.has(path) && material.size >= 200) { result.truncated = true; return; }
        material.add(path);
    };
    const record = (edge: Relation) => {
        if (!allowed(edge.from) || !allowed(edge.to) || !model.get(edge.from) || !model.get(edge.to)) return;
        const key = `${edge.from}\0${edge.type}\0${edge.to}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ ...edge });
        if (q.scope !== 'neighbors') return;
        const partner = seeds.has(edge.from) ? edge.to : edge.from;
        addMaterial(partner);
        if (!seeds.has(partner) && material.has(partner) && !reasons.has(partner)) reasons.set(partner, { ...edge });
    };
    for (const path of seeds) {
        if (!allowed(path) || !model.get(path)) {
            result.unavailable.push({ path, reason: isPathExcluded(path, excludedPaths) ? 'excluded' : 'missing' });
        } else addMaterial(path);
    }
    for (const path of seeds) {
        if (!material.has(path)) continue;
        const idea = model.get(path)!;
        for (const edge of idea.relations) { if (!spend()) break; record(edge); }
        // Incoming adjacency is allocation-free. Only inspect direct neighbors of original seeds.
        for (const from of model.inNeighborSet(path)) {
            if (!spend()) break;
            if (!allowed(from)) continue;
            const incoming = model.get(from);
            if (!incoming) continue;
            for (const edge of incoming.relations) {
                if (!spend()) break;
                if (edge.to === path) record(edge);
            }
        }
    }
    result.materials = [...material].sort().map(path => ({ path, selected: seeds.has(path) }));
    result.candidates = [...reasons].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, 50).map(([path, reason]) => ({ path, reason }));
    if (reasons.size > 50 || q.selectedPaths.length > 20) result.truncated = true;
    for (const edge of edges) {
        if (!material.has(edge.from) || !material.has(edge.to)) continue;
        if (result.relations.length >= 100) { result.truncated = true; break; }
        result.relations.push(edge);
    }
    for (const path of material) {
        const idea = model.get(path)!;
        for (const claim of idea.claims) {
            if (!spend()) break;
            for (const source of claim.sources) {
                if (!spend()) break;
                if (source.kind === 'link' && (!allowed(source.ref) || !model.get(source.ref))) continue;
                if (result.evidence.length + result.relations.length >= 100) { result.truncated = true; break; }
                result.evidence.push({ path, claim: claim.text, source: source.ref });
            }
        }
    }
    return result;
}

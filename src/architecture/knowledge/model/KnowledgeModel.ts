import type { Idea, Relation } from "./Idea";

/**
 * In-memory container for the knowledge graph: `Map<path, Idea>` plus incrementally-maintained
 * in/out adjacency and an edges-by-type index. All mutations are single-entry (create/modify =
 * `upsert`, delete = `remove`) except `rename`, which is O(edges) by design (decision #4). Queries
 * read these indexes and never re-derive (AC-8).
 *
 * Pure and Obsidian-free — the {@link KnowledgeIndex} service feeds it derived {@link Idea}s.
 */
export class KnowledgeModel {
    private static readonly EMPTY: ReadonlySet<string> = new Set<string>();
    private readonly ideas = new Map<string, Idea>();
    private readonly outAdj = new Map<string, Set<string>>();
    private readonly inAdj = new Map<string, Set<string>>();
    private readonly edgesByTypeIdx = new Map<string, Relation[]>();

    /** Replace the whole graph (initial build). */
    build(ideas: Idea[]): void {
        this.ideas.clear();
        for (const idea of ideas) this.ideas.set(idea.path, idea);
        this.reindex();
    }

    /** Insert or replace a single idea (create/modify), updating only the affected entries. */
    upsert(idea: Idea): void {
        const existing = this.ideas.get(idea.path);
        const oldTargets = existing ? [...(this.outAdj.get(idea.path) ?? [])] : [];
        if (existing) this.detach(existing);
        this.ideas.set(idea.path, idea);
        this.attach(idea);
        const affected = new Set<string>([idea.path, ...oldTargets, ...this.outNeighbors(idea.path)]);
        for (const path of affected) this.recomputeSignals(path);
    }

    /**
     * Remove a single idea (delete). Its outgoing edges are dropped; incoming edges from other
     * ideas remain (they tolerate the missing target — FR-9).
     */
    remove(path: string): void {
        const existing = this.ideas.get(path);
        if (!existing) return;
        const oldTargets = [...(this.outAdj.get(path) ?? [])];
        this.detach(existing);
        this.ideas.delete(path);
        for (const target of oldTargets) this.recomputeSignals(target);
    }

    /**
     * Re-key an idea and rewrite every edge that references `oldPath` (O(edges), the single
     * O(edges) op decision #4 permits), then rebuild the derived indexes.
     */
    rename(oldPath: string, newPath: string): void {
        if (oldPath === newPath) return;
        for (const idea of this.ideas.values()) {
            for (const relation of idea.relations) {
                if (relation.from === oldPath) relation.from = newPath;
                if (relation.to === oldPath) relation.to = newPath;
            }
        }
        const moving = this.ideas.get(oldPath);
        if (moving) {
            moving.path = newPath;
            this.ideas.delete(oldPath);
            this.ideas.set(newPath, moving);
        }
        this.reindex();
    }

    // ── read accessors ────────────────────────────────────────────────
    get(path: string): Idea | undefined {
        return this.ideas.get(path);
    }
    all(): Idea[] {
        return [...this.ideas.values()];
    }
    size(): number {
        return this.ideas.size;
    }
    outNeighbors(path: string): string[] {
        return [...(this.outAdj.get(path) ?? [])];
    }
    inNeighbors(path: string): string[] {
        return [...(this.inAdj.get(path) ?? [])];
    }
    /**
     * Allocation-free views of the adjacency for hot loops (#302). The returned set is the model's own
     * incrementally-maintained index — read-only; never mutate it. Prefer these over
     * {@link outNeighbors}/{@link inNeighbors} where you only iterate or test membership.
     */
    outNeighborSet(path: string): ReadonlySet<string> {
        return this.outAdj.get(path) ?? KnowledgeModel.EMPTY;
    }
    inNeighborSet(path: string): ReadonlySet<string> {
        return this.inAdj.get(path) ?? KnowledgeModel.EMPTY;
    }
    /** O(1) directed-edge test (`from → to`) — no array allocation (#302). */
    hasEdge(from: string, to: string): boolean {
        return this.outAdj.get(from)?.has(to) ?? false;
    }
    edgesOfType(type: string): Relation[] {
        return [...(this.edgesByTypeIdx.get(type) ?? [])];
    }
    relationTypes(): string[] {
        return [...this.edgesByTypeIdx.keys()];
    }

    // ── internals ─────────────────────────────────────────────────────
    private attach(idea: Idea): void {
        const out = new Set<string>();
        for (const relation of idea.relations) {
            out.add(relation.to);
            let incoming = this.inAdj.get(relation.to);
            if (!incoming) {
                incoming = new Set<string>();
                this.inAdj.set(relation.to, incoming);
            }
            incoming.add(idea.path);
            const list = this.edgesByTypeIdx.get(relation.type);
            if (list) list.push(relation);
            else this.edgesByTypeIdx.set(relation.type, [relation]);
        }
        this.outAdj.set(idea.path, out);
    }

    private detach(idea: Idea): void {
        const path = idea.path;
        for (const relation of idea.relations) {
            const incoming = this.inAdj.get(relation.to);
            if (incoming) {
                incoming.delete(path);
                if (incoming.size === 0) this.inAdj.delete(relation.to);
            }
            const list = this.edgesByTypeIdx.get(relation.type);
            if (list) {
                const kept = list.filter((edge) => edge.from !== path || edge.to !== relation.to);
                if (kept.length) this.edgesByTypeIdx.set(relation.type, kept);
                else this.edgesByTypeIdx.delete(relation.type);
            }
        }
        this.outAdj.delete(path);
    }

    private reindex(): void {
        this.outAdj.clear();
        this.inAdj.clear();
        this.edgesByTypeIdx.clear();
        for (const idea of this.ideas.values()) this.attach(idea);
        for (const path of this.ideas.keys()) this.recomputeSignals(path);
    }

    private recomputeSignals(path: string): void {
        const idea = this.ideas.get(path);
        if (!idea) return;
        const inDegree = this.inAdj.get(path)?.size ?? 0;
        const outDegree = this.outAdj.get(path)?.size ?? 0;
        idea.maturitySignals.inDegree = inDegree;
        idea.maturitySignals.outDegree = outDegree;
        idea.maturitySignals.degree = inDegree + outDegree;
    }
}

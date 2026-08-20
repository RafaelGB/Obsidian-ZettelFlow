// NOTE(#268): classifyHealth reads the raw Obsidian link graph (resolvedLinks) passed in by the view,
// NOT the KnowledgeModel — whose out-edges also include semantic relations. Unifying health onto the
// model would change the displayed orphan/dead-end numbers, so that unification is deferred to the
// Health view-collapse (#268). Relocated here verbatim (#266) so the calculator lives in the pure
// Knowledge State layer, not the Experience/view layer — same inputs, same numbers.

export type HealthNote = {
    path: string;
    basename: string;
};

export type HealthResult = {
    orphans: HealthNote[];
    deadEnds: HealthNote[];
    totalScanned: number;
    durationMs: number;
};

export type LinkGraph = {
    resolvedLinks: Record<string, Record<string, number>>;
    unresolvedLinks: Record<string, Record<string, number>>;
    markdownPaths: string[];
};

export function classifyHealth(graph: LinkGraph): HealthResult {
    const start = Date.now();
    const { resolvedLinks, markdownPaths } = graph;

    // Build backlink index: target path → set of source paths
    const backlinks = new Map<string, Set<string>>();
    for (const sourcePath of markdownPaths) {
        const targets = resolvedLinks[sourcePath] ?? {};
        for (const targetPath of Object.keys(targets)) {
            if (!backlinks.has(targetPath)) backlinks.set(targetPath, new Set());
            backlinks.get(targetPath)!.add(sourcePath);
        }
    }

    const orphans: HealthNote[] = [];
    const deadEnds: HealthNote[] = [];

    for (const path of markdownPaths) {
        const outgoing = Object.keys(resolvedLinks[path] ?? {}).filter((p) => p !== path);
        const incoming = backlinks.get(path) ?? new Set();
        const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
        if (outgoing.length === 0) orphans.push({ path, basename });
        if (incoming.size === 0) deadEnds.push({ path, basename });
    }

    return {
        orphans,
        deadEnds,
        totalScanned: markdownPaths.length,
        durationMs: Date.now() - start,
    };
}

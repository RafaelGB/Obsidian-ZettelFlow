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

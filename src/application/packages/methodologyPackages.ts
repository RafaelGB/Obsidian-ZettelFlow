import { STARTER_FLOW_PATHS, StarterFlowType } from "application/notes/starterFlowsService";

/**
 * A methodology package (#174): a named, atomic bundle of installable flow files (each already
 * carrying its #170 patterns) that *use* the built-in actions/dashboards. Packages ship no code —
 * the reference {@link ZETTELKASTEN_PACKAGE} is just a name over the #157 starter flows.
 */
export interface MethodologyPackage {
    id: string;
    name: string;
    description: string;
    version: string;
    flows: StarterFlowType[];
}

/** The built-in reference package: the five classic Zettelkasten flows as one installable unit. */
export const ZETTELKASTEN_PACKAGE: MethodologyPackage = {
    id: "zettelkasten",
    name: "Zettelkasten",
    description: "The classic Zettelkasten — fleeting, literature, permanent and structure flows, plus the Literature → Permanent capstone.",
    version: "1.0.0",
    flows: ["fleeting", "literature", "permanent", "moc", "literatureToPermanent"],
};

/** Every file a package owns — the canvas + step of each bundled flow, deduped and sorted. */
export function packageFilePaths(pkg: MethodologyPackage): string[] {
    const paths = new Set<string>();
    for (const flow of pkg.flows) {
        paths.add(STARTER_FLOW_PATHS[flow].canvas);
        paths.add(STARTER_FLOW_PATHS[flow].step);
    }
    return [...paths].sort();
}

/** Partition a package's owned paths by whether they already exist — what an install would create. */
export function planInstall(
    pkg: MethodologyPackage,
    existing: Set<string>
): { toCreate: string[]; alreadyPresent: string[] } {
    const owned = packageFilePaths(pkg);
    return {
        toCreate: owned.filter((path) => !existing.has(path)),
        alreadyPresent: owned.filter((path) => existing.has(path)),
    };
}

/** Partition the tracked paths of an installed package by existence — what an uninstall would trash. */
export function planRemove(
    trackedPaths: string[],
    existing: Set<string>
): { toTrash: string[]; missing: string[] } {
    const sorted = [...trackedPaths].sort();
    return {
        toTrash: sorted.filter((path) => existing.has(path)),
        missing: sorted.filter((path) => !existing.has(path)),
    };
}

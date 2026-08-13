import {
    StarterFlowInstallResult,
    StarterFlowVault,
    installStarterFlows,
} from "application/notes/starterFlowsService";
import { MethodologyPackage, packageFilePaths } from "./methodologyPackages";

/** The vault surface a package install/uninstall needs: the #157 create surface plus a trash op. */
export type PackageVault = StarterFlowVault & { trash(path: string): Promise<void> };

/**
 * Install a methodology package (#174) atomically. Reuses the idempotent #157 `installStarterFlows`
 * for its flows; on a mid-install `create` failure it **trashes the files it created this run and
 * rethrows**, so the vault is left in its pre-install state and the caller records nothing. Only the
 * package's own flow files are created/rolled back — never the shared folders. Obsidian-free.
 */
export async function installPackage(
    vault: PackageVault,
    pkg: MethodologyPackage
): Promise<{ paths: string[]; result: StarterFlowInstallResult }> {
    const createdThisRun: string[] = [];
    const recordingVault: PackageVault = {
        ...vault,
        create: async (path: string, data: string) => {
            const file = await vault.create(path, data);
            createdThisRun.push(path);
            return file;
        },
    };
    try {
        const result = await installStarterFlows(recordingVault, pkg.flows);
        return { paths: packageFilePaths(pkg), result };
    } catch (error) {
        for (const path of [...createdThisRun].reverse()) {
            try {
                await vault.trash(path);
            } catch {
                // best-effort rollback — a failed trash must not mask the original error
            }
        }
        throw error;
    }
}

/**
 * Uninstall a package (#174) by trashing exactly its tracked file paths that still resolve — never a
 * folder, never an untracked file. Idempotent (a missing path is a no-op). Obsidian-free.
 */
export async function uninstallPackage(
    vault: PackageVault,
    trackedPaths: string[]
): Promise<{ trashed: string[] }> {
    const trashed: string[] = [];
    for (const path of [...trackedPaths].sort()) {
        if (vault.getFileByPath(path)) {
            await vault.trash(path);
            trashed.push(path);
        }
    }
    return { trashed };
}

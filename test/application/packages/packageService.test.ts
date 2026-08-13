import { describe, it, expect } from "@jest/globals";
import { installPackage, uninstallPackage, PackageVault } from "application/packages/packageService";
import { ZETTELKASTEN_PACKAGE, packageFilePaths } from "application/packages/methodologyPackages";
import { STARTER_FLOW_PATHS } from "application/notes/starterFlowsService";

/** Set-backed mock vault (mirrors starterFlowsService.test.ts) + content capture + a trash op. */
function makeVault(preexisting: string[] = []) {
    const files = new Set<string>(preexisting);
    const content = new Map<string, string>();
    const foldersCreated: string[] = [];
    const vault: PackageVault = {
        getAbstractFileByPath: (p: string) => (files.has(p) ? { path: p } : null),
        getFileByPath: (p: string) => (files.has(p) ? { path: p } : null),
        createFolder: async (p: string) => {
            files.add(p);
            foldersCreated.push(p);
            return { path: p };
        },
        create: async (p: string, d: string) => {
            files.add(p);
            content.set(p, d);
            return { path: p };
        },
        trash: async (p: string) => {
            files.delete(p);
        },
    };
    return { vault, files, content, foldersCreated };
}

const owned = packageFilePaths(ZETTELKASTEN_PACKAGE);

describe("packageService (#174, FR-4/FR-5/FR-7/FR-11, AC-1/AC-2)", () => {
    it("installs every owned file (with the #170 pattern), idempotently", async () => {
        const { vault, files, content } = makeVault();
        const { paths, result } = await installPackage(vault, ZETTELKASTEN_PACKAGE);
        expect(paths).toEqual(owned);
        for (const path of owned) expect(files.has(path)).toBe(true);
        expect([...result.installed].sort()).toEqual([...ZETTELKASTEN_PACKAGE.flows].sort());
        expect(content.get(STARTER_FLOW_PATHS.permanent.step)).toContain("onCreation:");

        const second = await installPackage(vault, ZETTELKASTEN_PACKAGE);
        expect(second.result.installed).toEqual([]);
    });

    it("uninstalls exactly the tracked files and never a shared folder", async () => {
        const { vault, files, foldersCreated } = makeVault();
        await installPackage(vault, ZETTELKASTEN_PACKAGE);
        const { trashed } = await uninstallPackage(vault, owned);
        expect(trashed).toEqual(owned);
        for (const path of owned) expect(files.has(path)).toBe(false);
        for (const folder of foldersCreated) expect(files.has(folder)).toBe(true);
        // idempotent: uninstall again trashes nothing.
        expect((await uninstallPackage(vault, owned)).trashed).toEqual([]);
    });

    it("round-trips install → uninstall → reinstall cleanly", async () => {
        const { vault, files } = makeVault();
        await installPackage(vault, ZETTELKASTEN_PACKAGE);
        await uninstallPackage(vault, owned);
        await installPackage(vault, ZETTELKASTEN_PACKAGE);
        for (const path of owned) expect(files.has(path)).toBe(true);
    });

    it("rolls back a partial install on a create failure and rethrows (AC-1)", async () => {
        const { files, content, foldersCreated } = makeVault();
        let calls = 0;
        const vault: PackageVault = {
            getAbstractFileByPath: (p: string) => (files.has(p) ? { path: p } : null),
            getFileByPath: (p: string) => (files.has(p) ? { path: p } : null),
            createFolder: async (p: string) => {
                files.add(p);
                foldersCreated.push(p);
                return { path: p };
            },
            create: async (p: string, d: string) => {
                calls++;
                if (calls === 3) throw new Error("disk full");
                files.add(p);
                content.set(p, d);
                return { path: p };
            },
            trash: async (p: string) => {
                files.delete(p);
            },
        };
        await expect(installPackage(vault, ZETTELKASTEN_PACKAGE)).rejects.toThrow("disk full");
        // No owned file survives the rollback; folders (shared) are never trashed.
        for (const path of owned) expect(files.has(path)).toBe(false);
        for (const folder of foldersCreated) expect(files.has(folder)).toBe(true);
    });
});

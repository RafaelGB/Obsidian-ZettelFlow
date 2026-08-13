import { describe, it, expect } from "@jest/globals";
import {
    ZETTELKASTEN_PACKAGE,
    packageFilePaths,
    planInstall,
    planRemove,
} from "application/packages/methodologyPackages";
import { STARTER_FLOW_PATHS } from "application/notes/starterFlowsService";

const ownedPaths = (): string[] =>
    [...new Set(ZETTELKASTEN_PACKAGE.flows.flatMap((flow) => [STARTER_FLOW_PATHS[flow].canvas, STARTER_FLOW_PATHS[flow].step]))].sort();

describe("methodology package model (#174, FR-1/FR-2/FR-3, AC-1 pure)", () => {
    it("owns the sorted, deduped canvas+step of each bundled flow (10 files)", () => {
        const paths = packageFilePaths(ZETTELKASTEN_PACKAGE);
        expect(paths).toEqual(ownedPaths());
        expect(paths.length).toBe(10);
        expect(packageFilePaths(ZETTELKASTEN_PACKAGE)).toEqual(paths); // deterministic
    });

    it("planInstall partitions owned paths into toCreate / alreadyPresent", () => {
        const owned = ownedPaths();
        const existing = new Set([owned[0], owned[1]]);
        expect(planInstall(ZETTELKASTEN_PACKAGE, existing)).toEqual({
            toCreate: owned.slice(2),
            alreadyPresent: [owned[0], owned[1]],
        });
        expect(planInstall(ZETTELKASTEN_PACKAGE, new Set())).toEqual({ toCreate: owned, alreadyPresent: [] });
    });

    it("planRemove partitions tracked paths into toTrash / missing", () => {
        const tracked = ["b/x.md", "a/y.md", "c/z.md"];
        expect(planRemove(tracked, new Set(["a/y.md", "c/z.md"]))).toEqual({
            toTrash: ["a/y.md", "c/z.md"],
            missing: ["b/x.md"],
        });
    });
});

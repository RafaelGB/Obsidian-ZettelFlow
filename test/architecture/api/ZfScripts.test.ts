import { describe, it, expect, jest } from "@jest/globals";

/**
 * The library load (#904): building `zf` read every module one after another, so a cold disk made
 * the first script step of a flow wait for N round trips. The reads go side by side now.
 */
const files = ["a", "b", "c"].map((name) => ({ path: `lib/${name}.js`, basename: name, extension: "js" }));

jest.mock("architecture/api/lib/vault/service/ZfVault", () => ({
    ZfVault: () => ({
        resolveTFolder: () => ({ path: "lib" }),
        obtainFilesFrom: () => files,
    }),
}));

import { ZfScripts } from "architecture/api/lib/scripts/service/ZfScripts";

describe("the library load (#904)", () => {
    it("starts reading every module before the first read finishes", async () => {
        const started: string[] = [];
        const release: Array<() => void> = [];
        const app = {
            vault: {
                read: (file: { path: string }) => {
                    started.push(file.path);
                    return new Promise<string>((resolve) => release.push(() => resolve("module.exports = () => 1;")));
                },
            },
        };
        const scripts = new ZfScripts({ jsLibraryFolderPath: "lib" } as never, app as never);

        const loading = scripts.create_dynamic_functions();
        await Promise.resolve();
        await Promise.resolve();
        expect(started).toEqual(["lib/a.js", "lib/b.js", "lib/c.js"]);

        release.forEach((done) => done());
        await loading;
    });
});

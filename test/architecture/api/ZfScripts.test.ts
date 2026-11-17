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

const recorded: Array<Array<{ origin: { ref: string }; ok: boolean }>> = [];
const perRunRecords: string[] = [];
jest.mock("architecture/api/lib/recordScriptRun", () => {
    const actual = jest.requireActual<typeof import("architecture/api/lib/recordScriptRun")>("architecture/api/lib/recordScriptRun");
    return {
        ...actual,
        recordScriptRuns: (batch: never[]) => recorded.push([...batch]),
        withScriptRun: (facts: { origin: { ref: string } }, run: () => Promise<unknown>) => {
            perRunRecords.push(facts.origin.ref);
            return run();
        },
    };
});

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

    it("loads in folder order, and a module that cannot be read fails alone", async () => {
        const app = {
            vault: {
                // `c` answers first, `b` fails while `a` is still being waited for.
                read: (file: { path: string }) =>
                    file.path === "lib/b.js"
                        ? Promise.reject(new Error("locked"))
                        : new Promise<string>((resolve) =>
                              setTimeout(() => resolve("module.exports = () => 1;"), file.path === "lib/a.js" ? 20 : 0)
                          ),
            },
        };
        const scripts = new ZfScripts({ jsLibraryFolderPath: "lib" } as never, app as never);

        const api = await scripts.generate_object();

        expect(ZfScripts.describeModules().map((m) => [m.name, m.loaded])).toEqual([
            ["a", true],
            ["b", false],
            ["c", true],
        ]);
        expect(ZfScripts.describeModules().find((m) => m.name === "b")?.error).toBe("locked");
        expect(Object.keys(api)).toEqual(["a", "c"]);
    });

    it("listens to every read as soon as it starts, so a failure is never left unhandled", async () => {
        // Jest swallows `unhandledRejection`, so watch what Obsidian would: whether each read has a
        // handler before the loop goes on to wait for an earlier one.
        const handled: boolean[] = [];
        const release: Array<() => void> = [];
        const app = {
            vault: {
                read: () => {
                    const index = handled.push(false) - 1;
                    const promise = new Promise<string>((resolve) => release.push(() => resolve("module.exports = 1;")));
                    const then = promise.then.bind(promise);
                    return Object.assign(promise, {
                        then: (...args: Parameters<typeof then>) => {
                            handled[index] = true;
                            return then(...args);
                        },
                    });
                },
            },
        };
        const scripts = new ZfScripts({ jsLibraryFolderPath: "lib" } as never, app as never);

        const loading = scripts.create_dynamic_functions();
        await Promise.resolve();
        expect(handled).toEqual([true, true, true]);

        release.forEach((done) => done());
        await loading;
    });

    it("writes the whole load down with one record, failures included", async () => {
        recorded.length = 0;
        perRunRecords.length = 0;
        const app = {
            vault: {
                read: (file: { path: string }) =>
                    Promise.resolve(file.path === "lib/b.js" ? "throw new Error('bad module');" : "module.exports = () => 1;"),
            },
        };
        const scripts = new ZfScripts({ jsLibraryFolderPath: "lib" } as never, app as never);

        await scripts.create_dynamic_functions();

        expect(perRunRecords).toEqual([]);
        expect(recorded).toHaveLength(1);
        expect(recorded[0].map((facts) => [facts.origin.ref, facts.ok])).toEqual([
            ["lib/a.js", true],
            ["lib/b.js", false],
            ["lib/c.js", true],
        ]);
    });
});
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach, jest } from "@jest/globals";
import { TFile } from "obsidian";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the jest mock exposes a setter the real barrel does not
import { __setMockObsidianApi } from "architecture";
import { readTasks, __resetTaskCache } from "dashboards/base/taskSource";
import { installBrowserGlobals } from "../../support/dashboardDom";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    return f;
}
const item = (line: number, parent: number, task?: string) => ({ position: { start: { line } }, parent, task });

beforeAll(() => installBrowserGlobals());
beforeEach(() => __resetTaskCache());

describe("readTasks (#635) — Obsidian's index, confirmed against the line", () => {
    it("reads tasks with their depth, skips a note with no task without reading it, and tolerates CRLF", async () => {
        const files: Record<string, TFile> = { "a.md": file("a.md"), "b.md": file("b.md"), "c.md": file("c.md") };
        const contents: Record<string, string> = {
            "a.md": "# a\r\n- [ ] call\r\n    - [x] number\r\n- plain\r\n",
            "c.md": "- [ ] stale index",
        };
        const cachedRead = jest.fn(async (f: TFile) => contents[f.path]);
        const caches: Record<string, unknown> = {
            "a.md": { listItems: [item(1, -1, " "), item(2, 1, "x"), item(3, -1)] },
            "b.md": { listItems: [item(0, -1)] }, // a list, but no task
            "c.md": { listItems: [item(4, -1, " ")] }, // the index is a step behind the file
        };
        __setMockObsidianApi({
            vault: { getFileByPath: (path: string) => files[path] ?? null, cachedRead },
            metadataCache: { getFileCache: (f: TFile) => caches[f.path] ?? null },
        });

        const tasks = await readTasks(["a.md", "b.md", "c.md", "missing.md"]);
        expect(tasks).toEqual([
            { path: "a.md", line: 1, mark: " ", text: "call", depth: 0 },
            { path: "a.md", line: 2, mark: "x", text: "number", depth: 1 },
        ]);
        expect(cachedRead.mock.calls.map((call) => (call[0] as TFile).path)).toEqual(["a.md", "c.md"]);
    });

    it("a note that cannot be read is skipped, not fatal", async () => {
        const f = file("a.md");
        __setMockObsidianApi({
            vault: { getFileByPath: () => f, cachedRead: async () => { throw new Error("locked"); } },
            metadataCache: { getFileCache: () => ({ listItems: [item(0, -1, " ")] }) },
        });
        expect(await readTasks(["a.md"])).toEqual([]);
    });

});

describe("readTasks is fast on a large Base — the Tasks panel read every note, one after another, on every update", () => {
    function vaultOf(count: number, stat = (_i: number) => ({ mtime: 1, size: 10 })) {
        const files = new Map<string, TFile>();
        for (let i = 0; i < count; i++) {
            const f = file(`n${i}.md`);
            (f as any).stat = stat(i);
            files.set(f.path, f);
        }
        let inFlight = 0;
        let peak = 0;
        const cachedRead = jest.fn(async (f: TFile) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 1));
            inFlight--;
            return `- [ ] task of ${f.path}`;
        });
        const listItems: Record<string, unknown> = {};
        __setMockObsidianApi({
            vault: { getFileByPath: (path: string) => files.get(path) ?? null, cachedRead },
            metadataCache: { getFileCache: (f: TFile) => listItems[f.path] ?? { listItems: [item(0, -1, " ")] } },
        });
        return { files, cachedRead, peak: () => peak, listItems, paths: [...files.keys()] };
    }

    it("reads the notes side by side, a bounded number at a time, and keeps their order", async () => {
        const v = vaultOf(40);
        const tasks = await readTasks(v.paths);
        expect(v.peak()).toBeGreaterThan(1);
        expect(v.peak()).toBeLessThanOrEqual(16);
        expect(tasks.map((task) => task.path)).toEqual(v.paths);
    });

    it("never reads an unchanged note twice — the next update costs no read at all", async () => {
        const v = vaultOf(10);
        const first = await readTasks(v.paths);
        const second = await readTasks(v.paths);
        expect(second).toEqual(first);
        expect(v.cachedRead).toHaveBeenCalledTimes(10);
    });

    it("reads a note again when it changed, or when Obsidian's index caught up with it", async () => {
        const v = vaultOf(3);
        await readTasks(v.paths);
        (v.files.get("n0.md") as any).stat = { mtime: 2, size: 10 }; // edited
        v.listItems["n1.md"] = { listItems: [item(0, -1, " "), item(1, -1, " ")] }; // the index caught up
        await readTasks(v.paths);
        expect(v.cachedRead.mock.calls.slice(3).map((call) => (call[0] as TFile).path).sort()).toEqual(["n0.md", "n1.md"]);
    });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import { TFile } from "obsidian";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the jest mock exposes a setter the real barrel does not
import { __setMockObsidianApi } from "architecture";
import { readTasks } from "dashboards/base/taskSource";
import { installBrowserGlobals } from "../../support/dashboardDom";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    return f;
}
const item = (line: number, parent: number, task?: string) => ({ position: { start: { line } }, parent, task });

beforeAll(() => installBrowserGlobals());

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

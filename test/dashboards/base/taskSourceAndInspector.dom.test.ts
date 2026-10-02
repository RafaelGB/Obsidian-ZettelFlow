/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import { TFile } from "obsidian";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the jest mock exposes a setter the real barrel does not
import { __setMockObsidianApi } from "architecture";
import { normalize, reconcilePlan } from "dashboards/datastore";
import { readTasks } from "dashboards/base/taskSource";
import { FieldInspector } from "dashboards/base/FieldInspector";
import { DomNode, installBrowserGlobals } from "../../support/dashboardDom";

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

describe("FieldInspector (#623) — what the Base contains, before any panel", () => {
    const props = [
        { id: "note.hours", name: "hours" },
        { id: "note.date", name: "date" },
    ];
    const entry = (path: string) => ({
        path,
        cells: {
            "note.hours": { kind: "number" as const, display: "1", raw: 1 },
            "note.date": { kind: "date" as const, display: "2026-10-01", raw: "2026-10-01" },
        },
    });

    it("lists the fields with their types and the row count, and updates in place", () => {
        const host = new DomNode();
        const inspector = new FieldInspector(host as any);
        const first = normalize([entry("a.md")], props, "1");
        inspector.render(first, null); // before mount: remembered, drawn on load
        inspector.load();
        expect(host.oneByClass("base-dashboard-row-count").text).toBe("1 row");
        expect(host.byClass("base-dashboard-field-type").map((t) => t.text)).toEqual(["Number", "Date"]);

        const second = normalize([entry("a.md"), entry("b.md")], props, "2");
        inspector.render(second, reconcilePlan(first, second));
        expect(host.oneByClass("base-dashboard-row-count").text).toBe("2 rows");
        expect(host.byClass("base-dashboard-field")).toHaveLength(2);

        const empty = normalize([], [], "3");
        inspector.render(empty, null);
        expect(host.byText("This Base has no visible properties")).toBeDefined();
        inspector.unload();
    });
});

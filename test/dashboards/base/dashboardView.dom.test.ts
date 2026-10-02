/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach, jest } from "@jest/globals";
import { BasesEntry, BasesQueryResult, DateValue, Menu, NumberValue, QueryController, TFile } from "obsidian";
import { DashboardBasesView } from "dashboards/base/DashboardBasesView";
import { ComputedResolver, type ResolverDeps } from "dashboards/base/scriptTransform";
import type { DashboardModel } from "dashboards/panels";
import { DomNode, flush, installBrowserGlobals } from "../../support/dashboardDom";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    return f;
}

interface Harness {
    view: DashboardBasesView;
    root: DomNode;
    store: Record<string, unknown>;
    openLinkText: jest.Mock;
    changed: { fn: ((file: { path: string }) => void) | null };
}

function harness(model?: DashboardModel): Harness {
    const root = new DomNode();
    const view = new DashboardBasesView(new QueryController(), root as any);
    const store: Record<string, unknown> = model ? { zfDashboard: JSON.stringify(model) } : {};
    const openLinkText = jest.fn(async () => undefined);
    const changed: Harness["changed"] = { fn: null };
    (view as any).app = {
        workspace: { on: () => ({}), trigger: jest.fn(), openLinkText },
        metadataCache: {
            on: (_name: string, fn: (file: { path: string }) => void) => {
                changed.fn = fn;
                return {};
            },
        },
        vault: { getFileByPath: () => null },
    };
    (view as any).config = {
        get: (key: string) => store[key],
        set: (key: string, value: unknown) => (store[key] = value),
        getDisplayName: (id: string) => id.replace(/^note\./, ""),
        getSort: () => [],
    };
    view.allProperties = ["note.date", "note.hours"] as any;
    view.data = new BasesQueryResult(
        [
            new BasesEntry(file("Daily/a.md"), { "note.date": new DateValue("2026-09-30"), "note.hours": new NumberValue(6) }),
            new BasesEntry(file("Daily/b.md"), { "note.date": new DateValue("2026-10-01"), "note.hours": new NumberValue(8) }),
        ],
        ["note.date", "note.hours"],
    );
    view.load();
    return { view, root, store, openLinkText, changed };
}

const saved = (h: Harness): DashboardModel => JSON.parse(h.store.zfDashboard as string) as DashboardModel;
const statPanel = (id: string): DashboardModel["panels"][number] => ({ id, type: "stat", mapping: { aggregate: "count" } });

beforeAll(() => installBrowserGlobals());
beforeEach(() => {
    Menu.last = null;
});

describe("DashboardBasesView (#622/#632) — the shell", () => {
    it("with no panels shows the field inspector and the note count", () => {
        const h = harness();
        h.view.onDataUpdated();
        expect(h.root.oneByClass("base-dashboard-count").text).toBe("2 notes");
        expect(h.root.byText("No panels yet")).toBeDefined();
        expect(h.root.byClass("base-dashboard-field").length).toBe(2);
    });

    it("loads the saved panels on the first data update and draws them", () => {
        const h = harness({ panels: [statPanel("one"), statPanel("two")] });
        h.view.onDataUpdated();
        expect(h.root.byClass("base-dashboard-panel")).toHaveLength(2);
        expect(h.root.byText("No panels yet")).toBeUndefined();
    });

    it("a malformed saved config falls back to an empty dashboard instead of breaking", () => {
        const h = harness();
        h.store.zfDashboard = "{not json";
        h.view.onDataUpdated();
        expect(h.root.byText("No panels yet")).toBeDefined();
    });
});

describe("DashboardBasesView — what the panel actions do to the model", () => {
    function actions(h: Harness): any {
        return (h.view as any).panelActions();
    }

    it("duplicate inserts a copy right after the original, and saves", () => {
        const h = harness({ panels: [statPanel("one"), statPanel("two")] });
        h.view.onDataUpdated();
        actions(h).duplicate(statPanel("one"));
        const ids = saved(h).panels.map((p) => p.id);
        expect(ids).toHaveLength(3);
        expect(ids[0]).toBe("one");
        expect(ids[2]).toBe("two");
        expect(h.root.byClass("base-dashboard-panel")).toHaveLength(3);
    });

    it("move, place (drag) and canMove reorder the grid", () => {
        const h = harness({ panels: [statPanel("a"), statPanel("b"), statPanel("c")] });
        h.view.onDataUpdated();
        const act = actions(h);
        expect(act.canMove(statPanel("a"), -1)).toBe(false);
        expect(act.canMove(statPanel("a"), 1)).toBe(true);
        act.move(statPanel("a"), 1);
        expect(saved(h).panels.map((p) => p.id)).toEqual(["b", "a", "c"]);
        act.place("c", statPanel("b"), false);
        expect(saved(h).panels.map((p) => p.id)).toEqual(["c", "b", "a"]);
    });

    it("setLayout and remove persist", () => {
        const h = harness({ panels: [statPanel("a"), statPanel("b")] });
        h.view.onDataUpdated();
        const act = actions(h);
        act.setLayout(statPanel("a"), { w: 3, h: 2 });
        expect(saved(h).panels[0].layout).toEqual({ w: 3, h: 2 });
        act.remove(statPanel("a"));
        expect(saved(h).panels.map((p) => p.id)).toEqual(["b"]);
    });

    it("one note opens straight away (Mod → a new tab); several offer a menu", () => {
        const h = harness({ panels: [statPanel("a")] });
        h.view.onDataUpdated();
        const act = actions(h);
        act.openNotes(["Daily/a.md"], { ctrlKey: true });
        expect(h.openLinkText).toHaveBeenCalledWith("Daily/a.md", "", "tab");
        act.openNotes(["Daily/a.md", "Daily/b.md"], {});
        const menu = Menu.last as Menu;
        expect(menu.items.map((i) => i.title)).toEqual(["a", "b"]);
        menu.item("b").click({});
        expect(h.openLinkText).toHaveBeenLastCalledWith("Daily/b.md", "", false);
        act.openNotes([], {});
        expect(h.openLinkText).toHaveBeenCalledTimes(2);
    });
});

describe("DashboardBasesView — computed fields", () => {
    function withResolver(h: Harness, compile: ResolverDeps["compile"]): void {
        (h.view as any).resolver = new ComputedResolver({
            loadZf: async () => ({ knowledge: {}, internal: { vault: {} } }),
            compile,
            record: () => undefined,
        });
    }

    it("enriches every panel's schema and redraws", async () => {
        const h = harness({ panels: [statPanel("a")], computed: { enabled: true, code: "x" } });
        withResolver(h, () => async (row: any) => ({ half: row.hours / 2 }));
        h.view.onDataUpdated();
        await flush();
        expect(h.view.currentSnapshot?.schema.byId["half"]?.type).toBe("number");
        expect(h.root.oneByClass("base-dashboard-notice").hasClass("zettelkasten-flow__is-hidden")).toBe(true);
    });

    it("says inline how many notes it skipped, and fails safe on a total failure", async () => {
        const skip = harness({ panels: [statPanel("a")], computed: { enabled: true, code: "x" } });
        withResolver(skip, () => async (row: any) => {
            if (row.hours > 7) throw new Error("too long");
            return { half: row.hours / 2 };
        });
        skip.view.onDataUpdated();
        await flush();
        const notice = skip.root.oneByClass("base-dashboard-notice");
        expect(notice.hasClass("zettelkasten-flow__is-hidden")).toBe(false);
        expect(notice.textContent).toContain("skipped 1 note");
        expect(notice.textContent).toContain("too long");

        const fail = harness({ panels: [statPanel("a")], computed: { enabled: true, code: "x" } });
        withResolver(fail, () => async () => { throw new Error("boom"); });
        fail.view.onDataUpdated();
        await flush();
        const error = fail.root.oneByClass("base-dashboard-notice");
        expect(error.hasClass("is-error")).toBe(true);
        expect(error.textContent).toContain("boom");
        expect(fail.view.currentSnapshot?.schema.byId["half"]).toBeUndefined();
    });

});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach, jest } from "@jest/globals";
import { Menu } from "obsidian";
import { __charts } from "echarts/core";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import type { ChartTheme, PanelConfig, TaskItem } from "dashboards/panels";
import { PanelHost, type PanelHostActions, type TaskPort } from "dashboards/base/PanelHost";
import { DomNode, flush, installBrowserGlobals } from "../../support/dashboardDom";

const theme: ChartTheme = { text: "t", axis: "a", split: "s", palette: ["p0", "p1", "p2", "p3", "p4"] } as ChartTheme;
const props: FieldDescriptor[] = [
    { id: "note.date", name: "date" },
    { id: "note.hours", name: "hours" },
    { id: "note.mood", name: "mood" },
];
function dayKey(offset: number): string {
    const d = new Date(Date.now() - offset * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function entry(path: string, date: string, hours: number | null, mood: string): AdaptedEntry {
    return {
        path,
        cells: {
            "note.date": { kind: "date", display: date, raw: date },
            "note.hours": hours === null ? { kind: null, display: "", raw: null } : { kind: "number", display: String(hours), raw: hours },
            "note.mood": { kind: "category", display: mood, raw: mood },
        },
    };
}
const snap = () =>
    normalize(
        [entry("a.md", dayKey(2), 6, "ok"), entry("b.md", dayKey(1), 8, "good"), entry("c.md", dayKey(1), 4, "ok")],
        props,
        `s${Math.random()}`,
    );

function actions(): PanelHostActions & Record<string, jest.Mock> {
    return {
        edit: jest.fn(),
        duplicate: jest.fn(),
        remove: jest.fn(),
        move: jest.fn(),
        canMove: jest.fn((_c: PanelConfig, dir: -1 | 1) => dir === 1),
        setLayout: jest.fn(),
        place: jest.fn(),
        openNotes: jest.fn(),
        previewNote: jest.fn(),
    } as any;
}
const cfg = (type: PanelConfig["type"], mapping: PanelConfig["mapping"], extra: Partial<PanelConfig> = {}): PanelConfig => ({
    id: `p-${type}`,
    type,
    mapping,
    ...extra,
});

function mount(config: PanelConfig, act: PanelHostActions | null = actions(), options = {}): { host: PanelHost; parent: DomNode } {
    const parent = new DomNode();
    const host = new PanelHost(parent as any, config, act, options);
    host.load();
    return { host, parent };
}

beforeAll(() => installBrowserGlobals());
beforeEach(() => {
    Menu.last = null;
});

describe("PanelHost — what a panel draws (#632)", () => {
    it("a stat shows its number and label under the panel's title", () => {
        const { host, parent } = mount(cfg("stat", { value: "note.hours", aggregate: "avg" }, { title: "Hours" }));
        host.update(snap(), theme);
        expect(parent.oneByClass("base-dashboard-panel-title").text).toBe("Hours");
        expect(parent.oneByClass("base-dashboard-stat-value").text).toBe("6");
    });

    it("an unmapped panel says so and offers to configure it", () => {
        const act = actions();
        const { host, parent } = mount(cfg("bar", {}), act);
        host.update(snap(), theme);
        expect(parent.byText("Map a field to see this panel")).toBeDefined();
        parent.byText("Configure")?.click();
        expect(act.edit).toHaveBeenCalled();
    });

    it("a table row opens its note, previews on hover, and a header sorts", () => {
        const act = actions();
        const { host, parent } = mount(cfg("table", { columns: ["note.hours"] }), act);
        host.update(snap(), theme);
        const rows = parent.querySelectorAll("tr").slice(1);
        expect(rows.map((r) => r.textContent)).toEqual(["6", "8", "4"]);
        rows[1].click({ ctrlKey: true });
        expect(act.openNotes).toHaveBeenCalledWith(["b.md"], expect.objectContaining({ ctrlKey: true }));
        expect(act.previewNote).toHaveBeenCalledTimes(3);

        parent.querySelectorAll("th")[0].click();
        expect(parent.querySelectorAll("tr").slice(1).map((r) => r.textContent)).toEqual(["4", "6", "8"]);
        parent.querySelectorAll("th")[0].click();
        expect(parent.querySelectorAll("tr").slice(1).map((r) => r.textContent)).toEqual(["8", "6", "4"]);
        expect(parent.byClass("base-dashboard-sort-icon")).toHaveLength(1);
    });

    it("a calendar day with notes opens them; an empty day is not clickable", () => {
        const act = actions();
        const { host, parent } = mount(cfg("calendar", { category: "note.date" }), act);
        host.update(snap(), theme);
        const clickable = parent.byClass("base-dashboard-cal-cell").filter((cell) => cell.hasClass("is-clickable"));
        expect(clickable).toHaveLength(2);
        clickable[clickable.length - 1].click();
        expect(act.openNotes).toHaveBeenCalledWith(["b.md", "c.md"], expect.anything());
    });

    it("a click on a chart point opens the note behind it", () => {
        const act = actions();
        const { host } = mount(cfg("bar", { category: "note.date", series: ["note.hours"] }), act);
        host.update(snap(), theme);
        const chart = __charts[__charts.length - 1];
        expect(chart.options).toHaveLength(1);
        const evt = { ctrlKey: false };
        chart.handlers.click({ dataIndex: 2, event: { event: evt } });
        expect(act.openNotes).toHaveBeenCalledWith(["c.md"], evt);
        chart.handlers.click({ dataIndex: 2 }); // no native event (keyboard/API) → nothing to open with
        expect(act.openNotes).toHaveBeenCalledTimes(1);
    });

    it("every chart type builds an option; switching away disposes the chart", () => {
        const types: [PanelConfig["type"], PanelConfig["mapping"]][] = [
            ["line", { category: "note.date", series: ["note.hours"] }],
            ["area", { category: "note.date", series: ["note.hours"] }],
            ["scatter", { x: "note.hours", y: "note.hours" }],
            ["bubble", { x: "note.date", y: "note.hours", size: "note.hours" }],
            ["pie", { category: "note.mood", value: "note.hours" }],
            ["donut", { category: "note.mood", value: "note.hours" }],
            ["heatmap", { x: "note.mood", y: "note.date", value: "note.hours" }],
        ];
        for (const [type, mapping] of types) {
            const { host } = mount(cfg(type, mapping));
            host.update(snap(), theme);
            const chart = __charts[__charts.length - 1];
            expect(chart.options.length).toBeGreaterThan(0);
            host.setConfig(cfg("stat", { aggregate: "count" }));
            host.update(snap(), theme);
            expect(chart.disposed).toBe(true);
            host.unload();
        }
    });
});

describe("PanelHost — the panel menu, drag and preview (#632)", () => {
    it("the more button opens Obsidian's menu with every panel action", () => {
        const act = actions();
        const config = cfg("stat", { aggregate: "count" }, { layout: { w: 2, h: 1 } });
        const { host, parent } = mount(config, act);
        host.update(snap(), theme);
        parent.oneByClass("base-dashboard-panel-more").click();
        const menu = Menu.last as Menu;
        expect(menu.item("Move left").disabled).toBe(true);
        expect(menu.item("Move right").disabled).toBe(false);
        expect(menu.item("2 columns wide").checked).toBe(true);
        expect(menu.item("1 column wide").checked).toBe(false);
        expect(menu.item("Remove panel").warning).toBe(true);

        menu.item("Edit panel").click();
        menu.item("Duplicate").click();
        menu.item("Move right").click();
        menu.item("3 columns wide").click();
        menu.item("Tall").click();
        menu.item("Remove panel").click();
        expect(act.edit).toHaveBeenCalledWith(config);
        expect(act.duplicate).toHaveBeenCalledWith(config);
        expect(act.move).toHaveBeenCalledWith(config, 1);
        expect(act.setLayout).toHaveBeenCalledWith(config, { w: 3, h: 1 });
        expect(act.setLayout).toHaveBeenCalledWith(config, { w: 2, h: 2 });
        expect(act.remove).toHaveBeenCalledWith(config);
    });

    it("a right-click anywhere on the card opens the same menu; a double-click on the title edits", () => {
        const act = actions();
        const { host, parent } = mount(cfg("stat", { aggregate: "count" }), act);
        host.update(snap(), theme);
        const card = parent.oneByClass("base-dashboard-panel");
        const evt = card.fire("contextmenu");
        expect(evt.defaultPrevented).toBe(true);
        expect(Menu.last).not.toBeNull();
        parent.oneByClass("base-dashboard-panel-title").fire("dblclick");
        expect(act.edit).toHaveBeenCalled();
    });

    it("dragging a header onto another panel places it before or after", () => {
        const act = actions();
        const source = mount(cfg("stat", { aggregate: "count" }, { id: "src" }), act);
        const target = mount(cfg("stat", { aggregate: "count" }, { id: "dst" }), act);
        const data: Record<string, string> = {};
        const transfer = {
            types: ["application/x-zettelflow-panel"],
            setData: (type: string, value: string) => (data[type] = value),
            getData: (type: string) => data[type] ?? "",
            setDragImage: jest.fn(),
            effectAllowed: "",
            dropEffect: "",
        };
        const srcCard = source.parent.oneByClass("base-dashboard-panel");
        source.parent.oneByClass("base-dashboard-panel-handle").fire("dragstart", { dataTransfer: transfer, clientX: 10, clientY: 10 });
        expect(srcCard.hasClass("is-dragging")).toBe(true);

        const dstCard = target.parent.oneByClass("base-dashboard-panel");
        const over = dstCard.fire("dragover", { dataTransfer: transfer, clientX: 80 });
        expect(over.defaultPrevented).toBe(true);
        expect(dstCard.hasClass("is-drop-after")).toBe(true);
        dstCard.fire("dragover", { dataTransfer: transfer, clientX: 20 });
        expect(dstCard.hasClass("is-drop-before")).toBe(true);
        dstCard.fire("dragleave", { relatedTarget: new DomNode() });
        expect(dstCard.hasClass("is-drop-before")).toBe(false);

        dstCard.fire("dragover", { dataTransfer: transfer, clientX: 90 });
        dstCard.fire("drop", { dataTransfer: transfer });
        expect(act.place).toHaveBeenCalledWith("src", expect.objectContaining({ id: "dst" }), true);
        source.parent.oneByClass("base-dashboard-panel-handle").fire("dragend");
        expect(srcCard.hasClass("is-dragging")).toBe(false);

        // Something else dragged in (a file, text) is not a panel: no drop marker, no move.
        const foreign = { ...transfer, types: ["Files"] };
        const ignored = dstCard.fire("dragover", { dataTransfer: foreign, clientX: 80 });
        expect(ignored.defaultPrevented).toBe(false);
    });

    it("the preview has no header and nothing clickable", () => {
        const { host, parent } = mount(cfg("table", { columns: ["note.hours"] }), null, { preview: true });
        host.update(snap(), theme);
        expect(parent.byClass("base-dashboard-panel-header")).toHaveLength(0);
        expect(parent.oneByClass("base-dashboard-panel").hasClass("is-preview")).toBe(true);
        expect(parent.querySelectorAll("tr").some((tr) => tr.hasClass("is-clickable"))).toBe(false);
    });

    it("unload removes the card", () => {
        const { host, parent } = mount(cfg("stat", { aggregate: "count" }));
        host.update(snap(), theme);
        host.unload();
        expect(parent.byClass("base-dashboard-panel")).toHaveLength(0);
    });
});

describe("PanelHost — the Tasks panel (#635)", () => {
    const tasks: TaskItem[] = [
        { path: "a.md", line: 3, mark: " ", text: "call the supplier", depth: 0 },
        { path: "a.md", line: 4, mark: " ", text: "find the number", depth: 1 },
        { path: "b.md", line: 1, mark: "x", text: "send the invoice", depth: 0 },
    ];
    function port(over: Partial<TaskPort> = {}): TaskPort & { load: jest.Mock; toggle: jest.Mock; openAt: jest.Mock } {
        return {
            load: jest.fn(async () => tasks),
            toggle: jest.fn(async () => true),
            openAt: jest.fn(),
            ...over,
        } as any;
    }

    it("counts only what you asked to see, and lists it grouped by note with subtasks indented", async () => {
        const p = port();
        const { host, parent } = mount(cfg("tasks", { taskShow: "open", taskGroup: true }), actions(), { tasks: p });
        host.update(snap(), theme);
        expect(parent.byText("Reading tasks…")).toBeDefined();
        await flush();
        expect(p.load).toHaveBeenCalledWith(["a.md", "b.md", "c.md"]);
        expect(parent.oneByClass("base-dashboard-tasks-counts").text).toBe("2 open");
        expect(parent.byClass("base-dashboard-task-note").map((n) => n.text)).toEqual(["a"]);
        const rows = parent.byClass("base-dashboard-task");
        expect(rows.map((r) => r.oneByClass("base-dashboard-task-text").text)).toEqual(["call the supplier", "find the number"]);
        expect(rows[1].hasClass("is-depth-1")).toBe(true);
    });

    it("done and all say their own counts; an empty list says so", async () => {
        const { host, parent } = mount(cfg("tasks", { taskShow: "all", taskGroup: false }), actions(), { tasks: port() });
        host.update(snap(), theme);
        await flush();
        expect(parent.oneByClass("base-dashboard-tasks-counts").text).toBe("2 open · 1 done");
        expect(parent.byClass("base-dashboard-task-note")).toHaveLength(0);
        expect(parent.byClass("base-dashboard-task").filter((r) => r.hasClass("is-checked"))).toHaveLength(1);

        host.setConfig(cfg("tasks", { taskShow: "done" }));
        host.update(snap(), theme);
        await flush();
        expect(parent.oneByClass("base-dashboard-tasks-counts").text).toBe("1 done");

        const empty = mount(cfg("tasks", { taskShow: "open" }), actions(), { tasks: port({ load: jest.fn(async () => []) as any }) });
        empty.host.update(snap(), theme);
        await flush();
        expect(empty.parent.byText("No open tasks")).toBeDefined();
    });

    it("ticking a box writes through the port and redraws; a refused toggle says why", async () => {
        const p = port();
        const { host, parent } = mount(cfg("tasks", { taskShow: "open" }), actions(), { tasks: p });
        host.update(snap(), theme);
        await flush();
        const box = parent.querySelectorAll("input")[0];
        expect(box.disabled).toBe(false);
        box.fire("change");
        expect(box.disabled).toBe(true);
        await flush();
        expect(p.toggle).toHaveBeenCalledWith(tasks[0]);
        expect(p.load).toHaveBeenCalledTimes(2);

        p.toggle.mockImplementation(async () => false);
        parent.querySelectorAll("input")[0].fire("change");
        await flush();
        expect(parent.byText("This task changed since the dashboard read it, so nothing was written.")).toBeDefined();
    });

    it("a task's text opens its note at the line; its note's name opens the note", async () => {
        const p = port();
        const act = actions();
        const { host, parent } = mount(cfg("tasks", { taskShow: "open" }), act, { tasks: p });
        host.update(snap(), theme);
        await flush();
        parent.oneByClass("base-dashboard-task-text").click();
        expect(p.openAt).toHaveBeenCalledWith(tasks[0], expect.anything());
        parent.oneByClass("base-dashboard-task-note").click();
        expect(act.openNotes).toHaveBeenCalledWith(["a.md"], expect.anything());
    });

    it("the preview reads tasks but cannot tick them", async () => {
        const { host, parent } = mount(cfg("tasks", { taskShow: "open" }), null, { preview: true, tasks: { load: async () => tasks } });
        host.update(snap(), theme);
        await flush();
        expect(parent.querySelectorAll("input").every((box) => box.disabled)).toBe(true);
    });

    it("a slower, older read never paints over a newer render or another type", async () => {
        let release: (items: TaskItem[]) => void = () => undefined;
        const slow = port({ load: jest.fn(() => new Promise<TaskItem[]>((resolve) => (release = resolve))) as any });
        const { host, parent } = mount(cfg("tasks", { taskShow: "open" }), actions(), { tasks: slow });
        host.update(snap(), theme);
        host.setConfig(cfg("stat", { aggregate: "count" }));
        host.update(snap(), theme);
        release(tasks);
        await flush();
        expect(parent.byClass("base-dashboard-tasks")).toHaveLength(0);
        expect(parent.byClass("base-dashboard-stat")).toHaveLength(1);
    });

    it("a failing read shows an empty list rather than breaking the panel", async () => {
        const failing = port({ load: jest.fn(async () => { throw new Error("disk"); }) as any });
        const { host, parent } = mount(cfg("tasks", { taskShow: "open" }), actions(), { tasks: failing });
        host.update(snap(), theme);
        await flush();
        expect(parent.byText("No open tasks")).toBeDefined();
    });

    it("with no task port the panel stays empty", async () => {
        const { host, parent } = mount(cfg("tasks", {}), actions());
        host.update(snap(), theme);
        await flush();
        expect(parent.byClass("base-dashboard-task")).toHaveLength(0);
    });
});

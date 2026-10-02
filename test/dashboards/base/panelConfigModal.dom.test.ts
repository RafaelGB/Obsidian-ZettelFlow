/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { __captureSettings, type Setting } from "obsidian";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import type { ChartTheme, PanelConfig } from "dashboards/panels";
import { PanelConfigModal } from "dashboards/base/PanelConfigModal";
import { DomNode, flush, installBrowserGlobals } from "../../support/dashboardDom";

const theme = { text: "", axis: "", split: "", palette: ["", "", "", "", ""] } as ChartTheme;
const props: FieldDescriptor[] = [
    { id: "note.date", name: "date" },
    { id: "note.hours", name: "hours" },
    { id: "note.mood", name: "mood" },
];
const entry = (path: string, date: string, hours: number, mood: string): AdaptedEntry => ({
    path,
    cells: {
        "note.date": { kind: "date", display: date, raw: date },
        "note.hours": { kind: "number", display: String(hours), raw: hours },
        "note.mood": { kind: "category", display: mood, raw: mood },
    },
});
const snapshot = normalize([entry("a.md", "2026-09-30", 6, "ok"), entry("b.md", "2026-10-01", 8, "good")], props, "s");

let settings: Setting[] = [];
function open(initial: PanelConfig | null = null) {
    settings = [];
    __captureSettings((s) => settings.push(s));
    const onSubmit = jest.fn();
    const load = jest.fn(async () => []);
    const modal = new PanelConfigModal({} as any, snapshot, theme, { load }, initial, onSubmit);
    const content = new DomNode();
    (modal as any).contentEl = content;
    (modal as any).modalEl = new DomNode();
    modal.open();
    return { modal, content, onSubmit, load };
}
/** The live (most recent) setting with that name — re-renders leave detached copies behind. */
const setting = (name: string): Setting => {
    const found = [...settings].reverse().find((s) => s.name === name);
    if (!found) throw new Error(`no setting "${name}" in [${settings.map((s) => s.name).join(", ")}]`);
    return found;
};
const tile = (content: DomNode, label: string): DomNode =>
    content.byClass("base-dashboard-type-option").find((t) => t.oneByClass("base-dashboard-type-label").text === label) as DomNode;
const button = (content: DomNode, text: string): DomNode => content.find((el) => el.tag === "button" && el.text === text) as DomNode;

beforeAll(() => installBrowserGlobals());
afterEach(() => __captureSettings(null));

describe("PanelConfigModal (#632) — built from Obsidian's own parts", () => {
    it("titles itself, offers every panel type as a tile, and defaults to a working stat", () => {
        const { modal, content } = open();
        expect((modal as any).titleText).toBe("New panel");
        expect(content.byClass("base-dashboard-type-option")).toHaveLength(12);
        expect(tile(content, "Stat").getAttribute("aria-checked")).toBe("true");
        expect(setting("Value").dropdowns[0].value).toBe("note.hours");
        // Each option says the type it charts as.
        expect(setting("Value").dropdowns[0].options).toContainEqual(["note.hours", "hours · number"]);
        expect(content.oneByClass("base-dashboard-panel").hasClass("is-preview")).toBe(true);
    });

    it("saves exactly what the form shows", () => {
        const { content, onSubmit, modal } = open();
        setting("Title (optional)").texts[0].type("Average hours");
        setting("Aggregate").dropdowns[0].select("max");
        const close = jest.spyOn(modal, "close");
        button(content, "Save").click();
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stat", title: "Average hours", mapping: { value: "note.hours", aggregate: "max" } }),
        );
        expect(close).toHaveBeenCalled();
    });

    it("cancel closes without saving", () => {
        const { content, onSubmit, modal } = open();
        const close = jest.spyOn(modal, "close");
        button(content, "Cancel").click();
        expect(close).toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("switching type re-suggests a mapping; a series is picked as removable pills", () => {
        const { content, onSubmit } = open();
        tile(content, "Bar").click();
        expect(tile(content, "Bar").getAttribute("aria-checked")).toBe("true");
        expect(setting("Category").dropdowns[0].value).toBe("note.date");
        expect(content.byClass("base-dashboard-pill").map((p) => p.text)).toEqual(["hours"]);

        // Every number field is chosen, so there is nothing left to add: no "Add a field…" dropdown.
        expect(setting("Series").dropdowns).toHaveLength(0);
        content.byClass("base-dashboard-pill-remove")[0].click();
        expect(content.byClass("base-dashboard-pill")).toHaveLength(0);
        // The add dropdown lists only what is not chosen yet.
        expect(setting("Series").dropdowns[0].options).toEqual([["", "Add a field…"], ["note.hours", "hours · number"]]);
        setting("Series").dropdowns[0].select("note.hours");
        expect(content.byClass("base-dashboard-pill").map((p) => p.text)).toEqual(["hours"]);
        setting("Category").dropdowns[0].select("note.mood");

        button(content, "Save").click();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "bar", mapping: { category: "note.mood", series: ["note.hours"] } }));
    });

    it("builds a transform pipeline step by step, numbered, and removes a step", () => {
        const { content, onSubmit } = open();
        for (const type of ["filter", "sort", "groupBy", "aggregate", "bin", "calculate", "movingAverage", "normalize", "cumulative"]) {
            setting("Add transform").dropdowns[0].select(type);
        }
        expect(setting("1. Filter")).toBeDefined();
        expect(setting("9. Cumulative")).toBeDefined();

        const filter = setting("1. Filter");
        filter.dropdowns[0].select("note.date");
        expect(setting("1. Filter").dropdowns[1].options.map(([, label]) => label)).toContain("in the last … days");
        setting("1. Filter").dropdowns[1].select("lastDays");
        setting("1. Filter").texts[0].type("7");
        setting("2. Sort").dropdowns[1].select("desc");
        setting("3. Group by").dropdowns[2].select("avg");
        setting("4. Aggregate").dropdowns[1].select("max");
        setting("5. Bin").texts[0].type("5");
        setting("6. Calculate").dropdowns[1].select("div");
        setting("6. Calculate").texts[0].type("8");
        setting("6. Calculate").texts[1].type("ratio");
        setting("7. Moving average").texts[0].type("3");
        // The calculated field is mappable at once.
        expect(setting("Value").dropdowns[0].options.map(([id]) => id)).toContain("ratio");

        setting("9. Cumulative").extraButtons[0].click();
        button(content, "Save").click();
        const saved = onSubmit.mock.calls[0][0] as PanelConfig;
        expect(saved.transforms).toHaveLength(8);
        expect(saved.transforms?.[0]).toMatchObject({ type: "filter", field: "note.date", op: "lastDays", value: "7" });
        expect(saved.transforms?.[5]).toMatchObject({ type: "calculate", op: "div", value: "8", newField: "ratio" });
    });

    it("a Tasks panel maps no field — it asks which tasks and whether to group them", async () => {
        const { content, onSubmit, load } = open();
        tile(content, "Tasks").click();
        expect(setting("Show").dropdowns[0].value).toBe("open");
        expect(setting("Group by note").toggles[0].value).toBe(true);
        await flush();
        expect(load).toHaveBeenCalled(); // the preview reads the Base's tasks
        setting("Show").dropdowns[0].select("all");
        setting("Group by note").toggles[0].flip(false);
        button(content, "Save").click();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "tasks", mapping: { taskShow: "all", taskGroup: false } }));
    });

    it("editing keeps the panel's id and layout, and titles itself Edit panel", () => {
        const initial: PanelConfig = { id: "keep", type: "line", mapping: { category: "note.date", series: ["note.hours"] }, layout: { w: 2, h: 1 } };
        const { modal, content, onSubmit } = open(initial);
        expect((modal as any).titleText).toBe("Edit panel");
        button(content, "Save").click();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: "keep", layout: { w: 2, h: 1 } }));
        modal.close();
    });
});

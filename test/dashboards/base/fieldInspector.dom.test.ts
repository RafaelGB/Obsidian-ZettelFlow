/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { normalize, reconcilePlan } from "dashboards/datastore";
import { FieldInspector } from "dashboards/base/FieldInspector";
import { DomNode, installBrowserGlobals } from "../../support/dashboardDom";


beforeAll(() => installBrowserGlobals());


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

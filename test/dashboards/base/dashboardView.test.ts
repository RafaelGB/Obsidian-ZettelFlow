import { describe, it, expect } from "@jest/globals";
import { BasesEntry, BasesQueryResult, NumberValue, QueryController, TFile } from "obsidian";
import { DASHBOARD_VIEW_TYPE, DashboardBasesView } from "dashboards/base/DashboardBasesView";

function makeView(): DashboardBasesView {
    // A bare object as container: no `.empty()`, so the inspector never mounts under node jest.
    return new DashboardBasesView(new QueryController(), {} as HTMLElement);
}

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    return f;
}

describe("DashboardBasesView (AC-1 shape, AC-5 no write)", () => {
    it("declares the literal Bases view type", () => {
        expect(DASHBOARD_VIEW_TYPE).toBe("zettelflow-dashboard");
        expect(makeView().type).toBe("zettelflow-dashboard");
    });

    it("processes an empty result without throwing and yields an empty snapshot", () => {
        const view = makeView();
        view.data = new BasesQueryResult([], []);
        expect(() => view.onDataUpdated()).not.toThrow();
        expect(view.currentSnapshot?.rowCount).toBe(0);
    });

    it("normalizes a populated result end to end", () => {
        const view = makeView();
        view.data = new BasesQueryResult(
            [new BasesEntry(file("a.md"), { "note.hours": new NumberValue(6) })],
            ["note.hours"],
        );
        view.onDataUpdated();
        expect(view.currentSnapshot?.rowCount).toBe(1);
        expect(view.currentSnapshot?.schema.byId["note.hours"].type).toBe("number");
    });

    it("reuses the same snapshot when the data signature is unchanged", () => {
        const view = makeView();
        view.data = new BasesQueryResult(
            [new BasesEntry(file("a.md"), { "note.hours": new NumberValue(6) })],
            ["note.hours"],
        );
        view.onDataUpdated();
        const first = view.currentSnapshot;
        view.onDataUpdated();
        expect(view.currentSnapshot).toBe(first);
    });
});

import { describe, it, expect } from "@jest/globals";
import { placePanel, type PanelConfig } from "dashboards/panels";

const panels: PanelConfig[] = ["a", "b", "c", "d"].map((id) => ({ id, type: "stat", mapping: {} }));
const ids = (list: PanelConfig[]) => list.map((panel) => panel.id);

describe("placePanel — drag to reorder", () => {
    it("drops before a later panel", () => expect(ids(placePanel(panels, "a", "c", false))).toEqual(["b", "a", "c", "d"]));
    it("drops after a later panel", () => expect(ids(placePanel(panels, "a", "c", true))).toEqual(["b", "c", "a", "d"]));
    it("drops before an earlier panel", () => expect(ids(placePanel(panels, "d", "a", false))).toEqual(["d", "a", "b", "c"]));
    it("dropping on itself or an unknown panel changes nothing", () => {
        expect(placePanel(panels, "b", "b", true)).toBe(panels);
        expect(placePanel(panels, "b", "zz", true)).toBe(panels);
    });
});

import { describe, it, expect } from "@jest/globals";
import { popupMenuOptions } from "architecture/plugin/canvas/extensions/utils/popupMenuOptions";

describe("the popup offers what fits what is selected now (#432)", () => {
    it("offers the condition editor for an edge, and nothing else", () => {
        expect(popupMenuOptions({ size: 1, kind: "edge" })).toEqual({
            step: false,
            condition: true,
            copyFlow: false,
        });
    });

    it("offers the step editor for a text or group node", () => {
        expect(popupMenuOptions({ size: 1, kind: "text" })).toEqual({
            step: true,
            condition: false,
            copyFlow: false,
        });
        expect(popupMenuOptions({ size: 1, kind: "group" })).toEqual({
            step: true,
            condition: false,
            copyFlow: false,
        });
    });

    it("offers nothing for a file node — its step is edited from the note", () => {
        expect(popupMenuOptions({ size: 1, kind: "file" })).toEqual({
            step: false,
            condition: false,
            copyFlow: false,
        });
    });

    it("offers nothing for an empty selection", () => {
        expect(popupMenuOptions({ size: 0, kind: undefined })).toEqual({
            step: false,
            condition: false,
            copyFlow: false,
        });
    });

    it("offers neither editor for a multi-selection — both act on one element", () => {
        expect(popupMenuOptions({ size: 2, kind: "text" })).toMatchObject({
            step: false,
            condition: false,
        });
        expect(popupMenuOptions({ size: 3, kind: "edge" })).toMatchObject({
            step: false,
            condition: false,
        });
    });

    it("offers copying only when more than one thing is selected", () => {
        expect(popupMenuOptions({ size: 2, kind: "text" }).copyFlow).toBe(true);
        expect(popupMenuOptions({ size: 1, kind: "text" }).copyFlow).toBe(false);
        expect(popupMenuOptions({ size: 0, kind: undefined }).copyFlow).toBe(false);
    });

    it("offers nothing for a shape it does not recognise", () => {
        expect(popupMenuOptions({ size: 1, kind: "link" })).toEqual({
            step: false,
            condition: false,
            copyFlow: false,
        });
    });
});

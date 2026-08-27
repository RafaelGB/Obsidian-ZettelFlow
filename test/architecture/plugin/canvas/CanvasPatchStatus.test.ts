import { describe, it, expect, jest } from "@jest/globals";
import { CanvasPatchStatus } from "architecture/plugin/canvas/extensions/utils/CanvasPatchStatus";

describe("CanvasPatchStatus (#304)", () => {
    it("tracks attached and degraded patches", () => {
        const status = new CanvasPatchStatus();
        status.markAttached("view-data");
        status.markDegraded("popup-menu");
        expect(status.state("view-data")).toBe("attached");
        expect(status.state("popup-menu")).toBe("degraded");
        expect(status.degradedCount()).toBe(1);
        expect(status.summary()).toEqual([
            { name: "view-data", state: "attached" },
            { name: "popup-menu", state: "degraded" },
        ]);
    });

    it("a later attach never un-breaks a degraded patch", () => {
        const status = new CanvasPatchStatus();
        status.markDegraded("popup-menu");
        status.markAttached("popup-menu");
        expect(status.state("popup-menu")).toBe("degraded");
    });

    it("fires onFirstDegrade only once per name", () => {
        const onFirstDegrade = jest.fn();
        const status = new CanvasPatchStatus(onFirstDegrade);
        status.markDegraded("a");
        status.markDegraded("a");
        status.markDegraded("b");
        expect(onFirstDegrade).toHaveBeenCalledTimes(2);
        expect(onFirstDegrade).toHaveBeenCalledWith("a");
        expect(onFirstDegrade).toHaveBeenCalledWith("b");
    });

    it("describes the attach/degrade tally", () => {
        const status = new CanvasPatchStatus();
        status.markAttached("view-data");
        status.markAttached("popup-menu");
        status.markDegraded("view-render-events");
        expect(status.describe()).toBe("canvas patches: 2 attached, 1 degraded");
    });
});

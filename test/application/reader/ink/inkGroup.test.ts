import { describe, it, expect } from "@jest/globals";
import { GROUP_IDLE_MS, GROUP_REACH_EM, InkGrouping, joins, type InkBox } from "application/reader/ink/inkGroup";

const EM = 16;
const box = (left: number, top = 0, w = 20, h = 20): InkBox => ({ left, top, right: left + w, bottom: top + h });

describe("an ink note: strokes written together (#745 E4, AC-4, FR-9)", () => {
    it("joins a stroke inside the idle time and the reach, and starts a new one outside either", () => {
        const group = { box: box(0), lastUpAt: 1000 };
        expect(joins(group, { box: box(30), startedAt: 1000 + GROUP_IDLE_MS }, EM)).toBe(true);
        expect(joins(group, { box: box(30), startedAt: 1000 + GROUP_IDLE_MS + 1 }, EM)).toBe(false);
        // 4 em of gap is within reach; 4.1 em is not.
        expect(joins(group, { box: box(20 + GROUP_REACH_EM * EM), startedAt: 1100 }, EM)).toBe(true);
        expect(joins(group, { box: box(20 + 4.1 * EM), startedAt: 1100 }, EM)).toBe(false);
        expect(joins(null, { box: box(0), startedAt: 0 }, EM)).toBe(false);
    });

    it("writes a note once per group, when it goes idle", () => {
        const g = new InkGrouping<string>();
        g.penDown(0);
        expect(g.penUp("a", box(0), 100, EM)).toBeNull();
        g.penDown(400);
        expect(g.penUp("b", box(25), 500, EM)).toBeNull();
        expect(g.flush("idle", 500 + GROUP_IDLE_MS - 1)).toBeNull();
        const written = g.flush("idle", 500 + GROUP_IDLE_MS);
        expect(written?.strokes).toEqual(["a", "b"]);
        expect(g.flush("idle", 99_999)).toBeNull();
    });

    it("closes the open note when a stroke starts too late or too far, handing it over to be written", () => {
        const g = new InkGrouping<string>();
        g.penDown(0);
        g.penUp("a", box(0), 100, EM);
        g.penDown(100 + GROUP_IDLE_MS + 1);
        const closed = g.penUp("b", box(0), 2000, EM);
        expect(closed?.strokes).toEqual(["a"]);
        expect(g.current()?.strokes).toEqual(["b"]);
    });

    it("flushes on a turn and on close, but never mid-stroke", () => {
        const g = new InkGrouping<string>();
        g.penDown(0);
        g.penUp("a", box(0), 100, EM);
        g.penDown(200);
        expect(g.flush("turn", 300)).toBeNull();
        expect(g.flush("close", 300)).toBeNull();
        g.penUp("b", box(10), 400, EM);
        expect(g.flush("turn", 450)?.strokes).toEqual(["a", "b"]);
        expect(g.current()).toBeNull();
    });

    it("takes back a stroke that was never written", () => {
        const g = new InkGrouping<string>();
        g.penDown(0);
        g.penUp("a", box(0), 100, EM);
        expect(g.remove("a")).toBe(true);
        expect(g.current()).toBeNull();
        expect(g.flush("close", 10_000)).toBeNull();
    });
});

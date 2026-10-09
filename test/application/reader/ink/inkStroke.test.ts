import { describe, it, expect } from "@jest/globals";
import {
    appendPoint,
    distanceToSegment,
    inkWidth,
    INK_WIDTH_EM,
    mergedPaths,
    newStroke,
    segmentsOf,
    TILT_CAP,
    WIDTH_STEP_EM,
    type InkPoint,
    type Segment,
} from "application/reader/ink/inkStroke";
import { fixtureNames, loadInk, synthetic } from "../../../support/inkFixtures";

/** A point along a segment, at `k` from 0 to 1. */
function at(seg: Segment, k: number): [number, number] {
    if (!seg.c) return [seg.from[0] + (seg.to[0] - seg.from[0]) * k, seg.from[1] + (seg.to[1] - seg.from[1]) * k];
    const a = (1 - k) * (1 - k);
    const b = 2 * (1 - k) * k;
    const c = k * k;
    return [a * seg.from[0] + b * seg.c[0] + c * seg.to[0], a * seg.from[1] + b * seg.c[1] + c * seg.to[1]];
}

/** The live path: every committed segment, then the last provisional one — what the nib left. */
function live(points: readonly InkPoint[], pointerType = "pen"): Segment[] {
    const stroke = newStroke(pointerType);
    const out: Segment[] = [];
    let provisional: Segment | null = null;
    for (const point of points) {
        const step = appendPoint(stroke, point);
        if (step.committed) out.push(step.committed);
        provisional = step.provisional;
    }
    return provisional && points.length > 1 ? [...out, provisional] : provisional ? [provisional] : out;
}

describe("the stroke: width from pressure and tilt (#745 E1, AC-7, FR-4)", () => {
    it("is the medium width at medium pressure, upright", () => {
        expect(inkWidth({ pressure: 0.5, altitude: Math.PI / 2, pointerType: "pen" })).toBeCloseTo(INK_WIDTH_EM, 3);
    });

    it("widens with pressure, and thins with a light touch", () => {
        const medium = inkWidth({ pressure: 0.5, pointerType: "pen" });
        expect(inkWidth({ pressure: 1, pointerType: "pen" })).toBeGreaterThan(medium);
        expect(inkWidth({ pressure: 0.1, pointerType: "pen" })).toBeLessThan(medium);
    });

    it("gives a mouse, or a pen that reports no pressure, the steady medium width", () => {
        expect(inkWidth({ pressure: 0.9, pointerType: "mouse" })).toBe(inkWidth({ pressure: 0.5, pointerType: "pen" }));
        expect(inkWidth({ pressure: 0, pointerType: "pen" })).toBe(inkWidth({ pressure: 0.5, pointerType: "pen" }));
    });

    it("widens a pen laid on its side, never past the cap", () => {
        const upright = inkWidth({ pressure: 0.5, altitude: Math.PI / 2, pointerType: "pen" });
        const flat = inkWidth({ pressure: 0.5, altitude: 0, pointerType: "pen" });
        expect(flat).toBeGreaterThan(upright);
        // Within the cap, give or take the half step widths are quantised to.
        expect(flat).toBeLessThanOrEqual(INK_WIDTH_EM * TILT_CAP + WIDTH_STEP_EM / 2);
    });

    it("is pure: the same sample, the same width", () => {
        const sample = { pressure: 0.73, altitude: 0.8, pointerType: "pen" };
        expect(inkWidth(sample)).toBe(inkWidth({ ...sample }));
    });
});

describe("the nib leads, and pen-up moves nothing (#745 FR-18, FR-19, AC-11)", () => {
    it("ends the provisional segment exactly on the newest point, every time", () => {
        const stroke = newStroke("pen");
        for (const point of synthetic()[1].points) {
            const { provisional } = appendPoint(stroke, point);
            expect(provisional.to).toEqual([point.x, point.y]);
        }
    });

    it("commits nothing for the first point, and one segment for every point after", () => {
        const stroke = newStroke("pen");
        const points = synthetic()[0].points;
        expect(appendPoint(stroke, points[0]).committed).toBeUndefined();
        for (const point of points.slice(1)) expect(appendPoint(stroke, point).committed).toBeDefined();
    });

    const strokes = [
        ...synthetic().map((s) => ({ name: `synthetic ${s.name}`, points: s.points, type: "pen" })),
        ...fixtureNames().flatMap((name) => loadInk(name).strokes.map((s, i) => ({ name: `${name} #${i}`, points: s.points, type: s.pointerType }))),
    ];
    it.each(strokes)("keeps the live path of $name within half a pixel at every point", ({ points, type }) => {
        const kept = segmentsOf(points, type);
        const drawn = live(points, type);
        expect(kept).toHaveLength(drawn.length);
        let worst = 0;
        kept.forEach((seg, i) => {
            for (const k of [0, 0.25, 0.5, 0.75, 1]) {
                const [ax, ay] = at(seg, k);
                const [bx, by] = at(drawn[i], k);
                worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
            }
            expect(seg.w).toBe(drawn[i].w);
        });
        expect(worst).toBeLessThan(0.5);
    });
});

describe("pen-up leaves few paths, not one per point (#745 Risk 3)", () => {
    it("merges touching segments of one width without moving them", () => {
        const points = synthetic()[2].points; // steady pressure: one width
        const paths = mergedPaths(segmentsOf(points, "pen"));
        expect(paths.length).toBeLessThan(points.length / 4);
        expect(paths[0].d.startsWith("M0 50")).toBe(true);
    });

    it("measures how near a point is to a stroke, for the eraser", () => {
        const seg: Segment = { from: [0, 0], to: [10, 0], w: 0.1 };
        expect(distanceToSegment(seg, 5, 3)).toBeCloseTo(3);
        expect(distanceToSegment({ from: [0, 0], c: [5, 10], to: [10, 0], w: 0.1 }, 5, 5)).toBeLessThan(0.5);
    });
});

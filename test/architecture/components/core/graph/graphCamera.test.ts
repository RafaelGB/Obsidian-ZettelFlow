import { describe, it, expect } from "@jest/globals";
import {
    defaultCamera,
    dragCamera,
    flatScale,
    focalLength,
    frameGoal,
    MIN_DIST,
    PITCH_LIMIT,
    projectPoint,
    stepCamera,
    viewProjection,
    zoomCamera,
} from "architecture/components/core/graph/graphCamera";

/**
 * **One projection for the GPU and the pointer** (#693). The picker, the labels and the peek card ask
 * `projectPoint` with the matrix the shaders draw with; if the two disagreed, a click would land on
 * the note beside the one under the cursor.
 */
describe("the camera's projection (#693)", () => {
    it("puts the target in the middle of the view", () => {
        const cam = { ...defaultCamera(), tx: 10, ty: -5, tz: 30 };
        const m = viewProjection(cam, 800, 600);
        const p = projectPoint(m, cam, 10, -5, 30, 800, 600);
        expect(p?.x).toBeCloseTo(400, 3);
        expect(p?.y).toBeCloseTo(300, 3);
        expect(p?.depth).toBeCloseTo(cam.dist, 2);
    });

    it("draws nearer things bigger, by exactly focal ÷ depth", () => {
        const cam = defaultCamera();
        const m = viewProjection(cam, 800, 600);
        const p = projectPoint(m, cam, 0, 0, 0, 800, 600);
        expect(p?.scale).toBeCloseTo(focalLength(cam, 800, 600) / cam.dist, 5);
    });

    it("hides a point behind the camera", () => {
        const cam = { ...defaultCamera(), yaw: 0, pitch: 0, dist: 100 };
        const m = viewProjection(cam, 800, 600);
        // The eye is at +z; a point further out than the eye is behind it.
        expect(projectPoint(m, cam, 0, 0, 500, 800, 600)).toBeNull();
    });

    it("lays the flat sheet out as x across and z down, at one scale everywhere", () => {
        const cam = { ...defaultCamera(true), tx: 0, tz: 0 };
        const m = viewProjection(cam, 800, 600);
        const s = flatScale(cam);
        const p = projectPoint(m, cam, 10, 999, 20, 800, 600);
        expect(p?.x).toBeCloseTo(400 + 10 * s, 3);
        expect(p?.y).toBeCloseTo(300 + 20 * s, 3);
        expect(p?.scale).toBeCloseTo(s, 6);
    });
});

describe("the camera goes to the answer (#696)", () => {
    it("aims at the centre of what it frames, and backs off by its size", () => {
        const cam = defaultCamera();
        const goal = frameGoal(cam, [0, 0, 0, 100, 0, 0], 2);
        expect(goal).toMatchObject({ tx: 50, ty: 0, tz: 0 });
        expect(goal?.dist).toBeGreaterThanOrEqual(50 * 2.25);
    });

    it("never frames a single note so close it fills the screen", () => {
        expect(frameGoal(defaultCamera(), [5, 5, 5], 1, { min: 300 })?.dist).toBe(300);
    });

    it("frames nothing when there is nothing to frame", () => {
        expect(frameGoal(defaultCamera(), [], 0)).toBeNull();
    });

    it("arrives at once when motion is reduced (#319 S4)", () => {
        const cam = defaultCamera();
        expect(stepCamera(cam, { tx: 200, dist: 400 }, 16, true)).toBeNull();
        expect(cam.tx).toBe(200);
        expect(cam.dist).toBe(400);
    });

    it("eases toward the goal otherwise, and lands exactly", () => {
        const cam = defaultCamera();
        let goal: ReturnType<typeof stepCamera> = { tx: 200 };
        let steps = 0;
        while (goal && steps < 1000) {
            goal = stepCamera(cam, goal, 16, false);
            steps++;
        }
        expect(goal).toBeNull();
        expect(steps).toBeGreaterThan(5);
        expect(cam.tx).toBe(200);
    });
});

describe("the pointer moves the camera, within bounds (#693)", () => {
    it("never tips over the poles", () => {
        const cam = defaultCamera();
        dragCamera(cam, { ...cam }, 0, 10_000, false);
        expect(cam.pitch).toBe(PITCH_LIMIT);
    });

    it("pans the flat sheet under the pointer", () => {
        const cam = defaultCamera(true);
        const from = { ...cam };
        dragCamera(cam, from, 100, 0, false);
        expect(cam.tx).toBeCloseTo(-100 / flatScale(cam), 6);
    });

    it("zooms between a floor and the graph's own size", () => {
        const cam = defaultCamera();
        zoomCamera(cam, 1e-6, 5000);
        expect(cam.dist).toBe(MIN_DIST);
        zoomCamera(cam, 1e9, 5000);
        expect(cam.dist).toBe(5000);
    });
});

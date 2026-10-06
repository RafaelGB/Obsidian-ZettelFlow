import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { GraphCanvas } from "architecture/components/core/graph/GraphCanvas";
import { buildScene } from "architecture/components/core/graph/graphScene";
import type { FrameInput, GraphBackend } from "architecture/components/core/graph/graphFrame";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

/** A renderer that records what it was asked to draw, and whether it was let go. */
class RecordingBackend implements GraphBackend {
    readonly kind = "webgl2" as const;
    drawCalls = 5;
    frames: { paintVersion: number; positionsVersion: number; n: number }[] = [];
    disposed = 0;
    constructor(readonly canvas: HTMLCanvasElement) {}
    resize(): void {}
    render(frame: FrameInput): void {
        this.frames.push({ paintVersion: frame.paintVersion, positionsVersion: frame.positionsVersion, n: frame.n });
    }
    dispose(): void {
        this.disposed++;
    }
}

const scene = buildScene(
    build3DGraph(
        buildModel([
            idea("a.md", "seed", [{ to: "b.md" }]),
            idea("b.md", "seed", [{ to: "c.md" }]),
            idea("c.md", "seed", []),
        ])
    )
);

function mount() {
    jest.useFakeTimers();
    const host = new DomNode();
    let backend: RecordingBackend | null = null;
    const canvas = new GraphCanvas(host as never, {}, (el) => (backend = new RecordingBackend(el)));
    canvas.load();
    const settled = new Float32Array(scene.n * 3).map((_, i) => i * 10);
    canvas.setScene(scene, settled, 0);
    jest.advanceTimersByTime(50);
    return { canvas, backend: backend as unknown as RecordingBackend };
}

afterEach(() => jest.useRealTimers());

/**
 * **The engine's lifecycle** (#693, #695): it draws when asked, re-reads colours only when the
 * paint changed, and gives everything back when it goes.
 */
describe("the graph canvas (#695)", () => {
    it("draws the scene it was given", () => {
        const { backend } = mount();
        expect(backend.frames.length).toBeGreaterThan(0);
        expect(backend.frames[backend.frames.length - 1].n).toBe(3);
    });

    it("repaints when the answer changes", () => {
        const { canvas, backend } = mount();
        const before = backend.frames[backend.frames.length - 1].paintVersion;
        canvas.setLit(new Set([0]));
        jest.advanceTimersByTime(400);
        expect(backend.frames[backend.frames.length - 1].paintVersion).toBeGreaterThan(before);
    });

    it("draws a hover on the overlay without repainting a single buffer", () => {
        const { canvas, backend } = mount();
        jest.advanceTimersByTime(400);
        const before = backend.frames[backend.frames.length - 1].paintVersion;
        canvas.setMarked([1]);
        jest.advanceTimersByTime(50);
        expect(backend.frames[backend.frames.length - 1].paintVersion).toBe(before);
    });

    it("stops drawing when nothing moves — idle costs nothing", () => {
        const { backend } = mount();
        jest.advanceTimersByTime(1000);
        const count = backend.frames.length;
        jest.advanceTimersByTime(1000);
        expect(backend.frames.length).toBe(count);
    });

    it("gives its renderer back, once, and never draws again after it goes", () => {
        const { canvas, backend } = mount();
        canvas.unload();
        const count = backend.frames.length;
        canvas.setLit(new Set([1]));
        jest.advanceTimersByTime(500);
        expect(backend.disposed).toBe(1);
        expect(backend.frames.length).toBe(count);
    });
});

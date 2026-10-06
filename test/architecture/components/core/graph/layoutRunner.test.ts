import { describe, it, expect, jest, afterEach } from "@jest/globals";
import type { LayoutInput } from "architecture/components/core/graph/layoutCore";

function input(): LayoutInput {
    return { n: 3, edges: new Uint32Array([0, 1, 1, 2]), community: new Int32Array([0, 0, 0]), communityCount: 1 };
}

afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    delete (globalThis as { Worker?: unknown }).Worker;
});

/**
 * **The layout runs where it costs the view nothing** (#694): a worker when one can start, the main
 * thread in short slices when it cannot. Either way the positions arrive, and the last says done.
 */
describe("running the layout (#694)", () => {
    it("lays out on the main thread, in slices, when no worker can start", () => {
        jest.useFakeTimers();
        let runner: import("architecture/components/core/graph/layoutRunner").LayoutRunner | null = null;
        const calls: boolean[] = [];
        jest.isolateModules(() => {
            const { LayoutRunner } = jest.requireActual<typeof import("architecture/components/core/graph/layoutRunner")>("architecture/components/core/graph/layoutRunner");
            runner = new LayoutRunner(window, (_positions, done) => calls.push(done));
        });
        const r = runner as unknown as import("architecture/components/core/graph/layoutRunner").LayoutRunner;
        r.start(input());
        expect(r.where).toBe("main");
        for (let i = 0; i < 200 && !calls.includes(true); i++) jest.advanceTimersByTime(16);
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[calls.length - 1]).toBe(true);
        r.dispose();
    });

    it("hands the job to a worker started from the bundled source, and streams its answers", () => {
        const posted: unknown[] = [];
        class FakeWorker {
            onmessage: ((event: { data: unknown }) => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            constructor(public url: string) {}
            postMessage(message: unknown) {
                posted.push(message);
            }
            terminate() {}
        }
        (globalThis as { Worker?: unknown }).Worker = FakeWorker;
        jest.doMock("../../../../__mocks__/workerSource", () => ({ __esModule: true, default: "self.onmessage = () => {};" }));
        const seen: { positions: Float32Array; done: boolean }[] = [];
        let runner: import("architecture/components/core/graph/layoutRunner").LayoutRunner | null = null;
        jest.isolateModules(() => {
            const { LayoutRunner } = jest.requireActual<typeof import("architecture/components/core/graph/layoutRunner")>("architecture/components/core/graph/layoutRunner");
            runner = new LayoutRunner(window, (positions, done) => seen.push({ positions, done }));
        });
        const r = runner as unknown as import("architecture/components/core/graph/layoutRunner").LayoutRunner;
        r.start(input());
        expect(r.where).toBe("worker");
        const start = posted.find((m) => (m as { type: string }).type === "start") as { id: number };
        expect(start).toBeDefined();
        // The worker answers; a reply to an older job is ignored.
        const worker = (r as unknown as { worker: FakeWorker }).worker;
        worker.onmessage?.({ data: { type: "positions", id: start.id - 1, positions: new Float32Array(9), done: false, ticks: 1 } });
        worker.onmessage?.({ data: { type: "positions", id: start.id, positions: new Float32Array(9), done: true, ticks: 9 } });
        expect(seen).toHaveLength(1);
        expect(seen[0].done).toBe(true);
        r.dispose();
    });

    it("falls back to the main thread when the worker fails", () => {
        jest.useFakeTimers();
        class FailingWorker {
            onmessage: unknown = null;
            onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
            postMessage() {}
            terminate() {}
        }
        (globalThis as { Worker?: unknown }).Worker = FailingWorker;
        jest.doMock("../../../../__mocks__/workerSource", () => ({ __esModule: true, default: "throw new Error('nope')" }));
        const calls: boolean[] = [];
        let runner: import("architecture/components/core/graph/layoutRunner").LayoutRunner | null = null;
        jest.isolateModules(() => {
            const { LayoutRunner } = jest.requireActual<typeof import("architecture/components/core/graph/layoutRunner")>("architecture/components/core/graph/layoutRunner");
            runner = new LayoutRunner(window, (_positions, done) => calls.push(done));
        });
        const r = runner as unknown as import("architecture/components/core/graph/layoutRunner").LayoutRunner;
        r.start(input());
        const worker = (r as unknown as { worker: FailingWorker }).worker;
        worker.onerror?.({ message: "nope", preventDefault: () => undefined });
        expect(r.where).toBe("main");
        for (let i = 0; i < 200 && !calls.includes(true); i++) jest.advanceTimersByTime(16);
        expect(calls[calls.length - 1]).toBe(true);
        r.dispose();
    });
});

describe("the worker itself (#694)", () => {
    it("lays out what it is sent and says when it has settled", () => {
        jest.useFakeTimers();
        const replies: { id: number; done: boolean; positions: Float32Array }[] = [];
        const scope: {
            onmessage: ((event: { data: unknown }) => void) | null;
            postMessage(message: unknown): void;
            setTimeout(handler: () => void, ms: number): number;
        } = {
            onmessage: null,
            postMessage: (message) => replies.push(message as { id: number; done: boolean; positions: Float32Array }),
            setTimeout: (handler, ms) => setTimeout(handler, ms) as unknown as number,
        };
        (globalThis as { self?: unknown }).self = scope;
        jest.isolateModules(() => {
            jest.requireActual("architecture/components/core/graph/layout.worker");
        });
        scope.onmessage?.({ data: { type: "start", id: 7, input: input() } });
        for (let i = 0; i < 500 && !replies.some((reply) => reply.done); i++) jest.advanceTimersByTime(1);
        expect(replies.length).toBeGreaterThan(0);
        expect(replies.every((reply) => reply.id === 7)).toBe(true);
        expect(replies[replies.length - 1].done).toBe(true);
        expect(replies[replies.length - 1].positions).toHaveLength(9);
        delete (globalThis as { self?: unknown }).self;
    });
});

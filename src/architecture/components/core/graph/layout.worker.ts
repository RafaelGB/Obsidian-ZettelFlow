import { createLayout, type Layout, type LayoutInput } from "./layoutCore";
import { LAYOUT_SLICE_MS, type LayoutMessage, type LayoutReply } from "./layoutProtocol";

/**
 * The layout worker (#694): the force layout, off the main thread.
 *
 * Bundled into a string by esbuild (`?worker`) and started from a Blob, because Obsidian loads one
 * `main.js` and nothing else. It ticks for a slice, posts the positions, and yields — so a newer
 * graph or a `stop` is never stuck behind a long run.
 */
interface WorkerScope {
    onmessage: ((event: MessageEvent<LayoutMessage>) => void) | null;
    postMessage(message: LayoutReply, transfer?: Transferable[]): void;
    /** A worker has no `window`: its own timer yields between slices. */
    setTimeout(handler: () => void, ms: number): number;
}

const scope = self as unknown as WorkerScope;
let job: { id: number; layout: Layout } | null = null;

function run(): void {
    const current = job;
    if (!current) return;
    const started = performance.now();
    while (performance.now() - started < LAYOUT_SLICE_MS && !current.layout.settled()) current.layout.tick();
    if (job !== current) return;
    const done = current.layout.settled();
    const positions = current.layout.positions.slice();
    scope.postMessage({ type: "positions", id: current.id, positions, done, ticks: current.layout.ticks }, [positions.buffer]);
    if (done) {
        job = null;
        return;
    }
    scope.setTimeout(run, 0);
}

scope.onmessage = (event: MessageEvent<LayoutMessage>) => {
    const message = event.data;
    if (message.type === "stop") {
        job = null;
        return;
    }
    const input: LayoutInput = message.input;
    job = { id: message.id, layout: createLayout(input) };
    run();
};

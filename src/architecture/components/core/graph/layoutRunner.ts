import { createLayout, type Layout, type LayoutInput } from "./layoutCore";
import { MAIN_THREAD_SLICE_MS } from "./layoutProtocol";

export type PositionsListener = (positions: Float32Array, done: boolean) => void;

/**
 * Runs the force layout in slices of a few milliseconds (#693), so the view never stalls while it
 * settles; the positions stream back as it does.
 */
export class LayoutRunner {
    private jobId = 0;
    private local: { id: number; layout: Layout } | null = null;
    private localTimer: number | undefined;
    private disposed = false;

    constructor(private readonly win: Window, private readonly listener: PositionsListener) {}

    get where(): "worker" | "main" {
        return "main";
    }

    start(input: LayoutInput): void {
        if (this.disposed) return;
        this.stop();
        const id = ++this.jobId;
        this.local = { id, layout: createLayout({ ...input, initial: input.initial?.slice() }) };
        const step = () => {
            const job = this.local;
            if (!job || job.id !== this.jobId || this.disposed) return;
            const started = performance.now();
            while (performance.now() - started < MAIN_THREAD_SLICE_MS && !job.layout.settled()) job.layout.tick();
            const done = job.layout.settled();
            this.listener(job.layout.positions, done);
            if (done) {
                this.local = null;
                return;
            }
            this.localTimer = this.win.setTimeout(step, 16);
        };
        step();
    }

    stop(): void {
        this.local = null;
        this.win.clearTimeout(this.localTimer);
        this.localTimer = undefined;
    }

    dispose(): void {
        this.disposed = true;
        this.stop();
    }
}

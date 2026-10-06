import { log } from "architecture";
import workerSource from "./layout.worker?worker";
import { createLayout, type Layout, type LayoutInput } from "./layoutCore";
import { MAIN_THREAD_SLICE_MS, type LayoutMessage, type LayoutReply } from "./layoutProtocol";

export type PositionsListener = (positions: Float32Array, done: boolean) => void;

/**
 * Runs the force layout where it costs the view nothing (#694): in a Web Worker started from a
 * Blob of the bundled worker source, and — when a worker cannot start (no `Worker`, a policy that
 * refuses blob URLs, an error inside it) — on the main thread in slices of a few milliseconds, so
 * the view still never stalls. Either way the positions stream back while the layout settles.
 */
export class LayoutRunner {
    private worker: Worker | null = null;
    private workerUrl: string | null = null;
    private workerFailed = false;
    private jobId = 0;
    private pending: LayoutInput | null = null;
    private local: { id: number; layout: Layout } | null = null;
    private localTimer: number | undefined;
    private disposed = false;

    constructor(private readonly win: Window, private readonly listener: PositionsListener) {}

    /** The thread the layout runs on — what the status line can say when someone asks. */
    get where(): "worker" | "main" {
        return this.worker && !this.workerFailed ? "worker" : "main";
    }

    start(input: LayoutInput): void {
        if (this.disposed) return;
        this.stop();
        const id = ++this.jobId;
        this.pending = input;
        const worker = this.ensureWorker();
        if (worker) {
            const message: LayoutMessage = { type: "start", id, input: { ...input, initial: input.initial?.slice() } };
            try {
                worker.postMessage(message);
                return;
            } catch (error) {
                log.warn("[Graph] the layout worker refused the job; laying out here", error);
                this.failWorker();
            }
        }
        this.runLocal(id, input);
    }

    stop(): void {
        this.pending = null;
        this.local = null;
        this.win.clearTimeout(this.localTimer);
        this.localTimer = undefined;
        if (this.worker) {
            try {
                this.worker.postMessage({ type: "stop" } satisfies LayoutMessage);
            } catch {
                // A worker that is already gone has nothing to stop.
            }
        }
    }

    dispose(): void {
        this.disposed = true;
        this.stop();
        this.worker?.terminate();
        this.worker = null;
        if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
        this.workerUrl = null;
    }

    private ensureWorker(): Worker | null {
        if (this.worker || this.workerFailed) return this.worker;
        if (!workerSource || typeof Worker !== "function" || typeof Blob !== "function" || typeof URL?.createObjectURL !== "function") {
            this.workerFailed = true;
            return null;
        }
        try {
            // Obsidian starts its own workers the same way: a Blob of the source, a blob: URL.
            const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
            this.workerUrl = url;
            const worker = new Worker(url, { name: "ZettelFlow graph layout" });
            worker.onmessage = (event: MessageEvent<LayoutReply>) => this.onReply(event.data);
            worker.onerror = (event) => {
                event.preventDefault?.();
                log.warn("[Graph] the layout worker failed; laying out on the main thread", event.message);
                const input = this.pending;
                this.failWorker();
                if (input) this.runLocal(this.jobId, input);
            };
            this.worker = worker;
            return worker;
        } catch (error) {
            log.warn("[Graph] could not start the layout worker; laying out on the main thread", error);
            this.failWorker();
            return null;
        }
    }

    private failWorker(): void {
        this.workerFailed = true;
        this.worker?.terminate();
        this.worker = null;
    }

    private onReply(reply: LayoutReply): void {
        if (this.disposed || reply.id !== this.jobId) return;
        if (reply.done) this.pending = null;
        this.listener(reply.positions, reply.done);
    }

    private runLocal(id: number, input: LayoutInput): void {
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
                this.pending = null;
                return;
            }
            this.localTimer = this.win.setTimeout(step, 16);
        };
        step();
    }
}

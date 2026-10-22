import { log } from "architecture";
import type { AiProvider } from "architecture/ai/AiProvider";

/**
 * **The Reader's AI queue** (#759 FR-9, shared with #766's *Translate*). Every request the Reader
 * sends to your AI provider goes through one of these, owned by the Reader session — not a singleton,
 * so a closed Reader takes its waiting requests with it.
 *
 * - **One request per click.** The same key while it waits is ignored (`ask` returns `null`).
 * - **At most {@link READER_AI_CONCURRENCY} at once.** A third waits its turn, is marked `queued`,
 *   and is sent when a slot frees. It is never dropped and never sent silently: it was your click.
 * - **Cancel** discards what comes back. The provider cannot be interrupted, so the request keeps its
 *   slot until it settles, and its answer is dropped.
 * - **Nothing retries on its own.** *Try again* is a new `ask`.
 *
 * The outcome is a value, never a rejection: an answer, a failure by kind (timed out, a status, or
 * anything else — logged by kind, never with content), or discarded.
 */

/** Two moves on one passage (*Why?*, then *Challenge*) is the normal use; one would make the second click feel broken. */
export const READER_AI_CONCURRENCY = 2;

export type ReaderAiFailure = { kind: "timeout" } | { kind: "status"; status: number } | { kind: "failed" };

export type ReaderAiOutcome = { kind: "answer"; text: string } | { kind: "failed"; failure: ReaderAiFailure } | { kind: "discarded" };

export interface ReaderAiJob {
    /** What came back — or `discarded` when it was cancelled or the Reader closed. */
    result: Promise<ReaderAiOutcome>;
    /** Resolves when the request is sent: at once, or when a slot frees for a queued one. */
    started: Promise<void>;
    /** Whether it waits its turn behind the ones in flight. */
    queued: boolean;
    /** Discard whatever comes back; a queued one is never sent. */
    cancel(): void;
}

/** A provider's error, by kind (FR-9): `timed out`, `status N`, or anything else. */
export function classifyAiFailure(error: unknown): ReaderAiFailure {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out/i.test(message)) return { kind: "timeout" };
    const status = message.match(/status (\d{3})/);
    if (status) return { kind: "status", status: Number(status[1]) };
    return { kind: "failed" };
}

interface Job {
    key: string;
    prompt: string;
    sent: boolean;
    done: boolean;
    cancelled: boolean;
    settle(outcome: ReaderAiOutcome): void;
    start(): void;
}

export class ReaderAiQueue {
    private running = 0;
    private readonly waiting: Job[] = [];
    private readonly live = new Map<string, Job>();
    private disposed = false;

    constructor(
        private readonly provider: () => AiProvider,
        private readonly concurrency = READER_AI_CONCURRENCY
    ) {}

    /** Whether a request under `key` is waiting or in flight. */
    has(key: string): boolean {
        return this.live.has(key);
    }

    /** Ask once. `null` when the same key already waits: a double click sends nothing more. */
    ask(key: string, prompt: string): ReaderAiJob | null {
        if (this.disposed || this.live.has(key)) return null;
        let settle!: (outcome: ReaderAiOutcome) => void;
        const result = new Promise<ReaderAiOutcome>((resolve) => (settle = resolve));
        let start!: () => void;
        const started = new Promise<void>((resolve) => (start = resolve));
        const job: Job = {
            key,
            prompt,
            sent: false,
            done: false,
            cancelled: false,
            settle: (outcome) => {
                if (job.done) return;
                job.done = true;
                if (this.live.get(key) === job) this.live.delete(key);
                settle(outcome);
            },
            start,
        };
        this.live.set(key, job);
        const queued = this.running >= this.concurrency;
        if (queued) this.waiting.push(job);
        else this.send(job);
        return { result, started, queued, cancel: () => this.cancel(job) };
    }

    /** The Reader closed: every pending result is discarded, and nothing queued is sent. */
    dispose(): void {
        this.disposed = true;
        for (const job of this.live.values()) this.cancel(job);
        this.waiting.length = 0;
    }

    private cancel(job: Job): void {
        if (job.done) return;
        job.cancelled = true;
        const at = this.waiting.indexOf(job);
        if (at >= 0) this.waiting.splice(at, 1);
        job.settle({ kind: "discarded" });
    }

    private send(job: Job): void {
        job.sent = true;
        this.running++;
        job.start();
        let request: Promise<string>;
        try {
            request = this.provider().complete(job.prompt);
        } catch (error) {
            request = Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
        void request.then(
            (text) => this.finish(job, { kind: "answer", text }),
            (error: unknown) => {
                const failure = classifyAiFailure(error);
                // By kind and status only: no prompt, no passage, no answer.
                log.warn(`[reader] an AI move failed: ${failure.kind}${failure.kind === "status" ? ` ${failure.status}` : ""}`);
                this.finish(job, { kind: "failed", failure });
            }
        );
    }

    private finish(job: Job, outcome: ReaderAiOutcome): void {
        this.running--;
        job.settle(job.cancelled || this.disposed ? { kind: "discarded" } : outcome);
        const next = this.disposed ? undefined : this.waiting.shift();
        if (next) this.send(next);
    }
}

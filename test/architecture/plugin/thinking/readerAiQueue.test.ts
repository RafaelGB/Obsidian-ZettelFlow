import { describe, it, expect, jest } from "@jest/globals";
import { ReaderAiQueue, READER_AI_CONCURRENCY, classifyAiFailure } from "architecture/plugin/thinking/readerAiQueue";

/** **The Reader's AI queue** (#759 FR-9, AC-6): one request per click, two at once, nothing on its own. */

function deferred() {
    let resolve!: (text: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function harness() {
    const calls: { prompt: string; d: ReturnType<typeof deferred> }[] = [];
    const complete = jest.fn((prompt: string) => {
        const d = deferred();
        calls.push({ prompt, d });
        return d.promise;
    });
    const queue = new ReaderAiQueue(() => ({ complete }));
    return { queue, complete, calls };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the Reader's AI queue (#759 FR-9, AC-6)", () => {
    it("allows two at once", () => {
        expect(READER_AI_CONCURRENCY).toBe(2);
    });

    it("ignores the same key while it waits: a double click sends one request", () => {
        const h = harness();
        expect(h.queue.ask("why:a:c1", "p")).not.toBeNull();
        expect(h.queue.ask("why:a:c1", "p")).toBeNull();
        expect(h.complete).toHaveBeenCalledTimes(1);
    });

    it("sends two, holds the third as queued, and sends it when one settles", async () => {
        const h = harness();
        const a = h.queue.ask("a", "pa")!;
        const b = h.queue.ask("b", "pb")!;
        const c = h.queue.ask("c", "pc")!;
        expect([a.queued, b.queued, c.queued]).toEqual([false, false, true]);
        expect(h.complete).toHaveBeenCalledTimes(2);
        let started = false;
        void c.started.then(() => (started = true));
        h.calls[0].d.resolve("answer a");
        expect(await a.result).toEqual({ kind: "answer", text: "answer a" });
        await tick();
        expect(h.complete).toHaveBeenCalledTimes(3);
        expect(h.calls[2].prompt).toBe("pc");
        expect(started).toBe(true);
    });

    it("drops a late answer once cancelled", async () => {
        const h = harness();
        const a = h.queue.ask("a", "pa")!;
        a.cancel();
        h.calls[0].d.resolve("too late");
        expect(await a.result).toEqual({ kind: "discarded" });
    });

    it("never sends a queued request that was cancelled", async () => {
        const h = harness();
        h.queue.ask("a", "pa");
        h.queue.ask("b", "pb");
        const c = h.queue.ask("c", "pc")!;
        c.cancel();
        h.calls[0].d.resolve("x");
        await tick();
        expect(h.complete).toHaveBeenCalledTimes(2);
        expect(await c.result).toEqual({ kind: "discarded" });
    });

    it("discards everything when the Reader closes", async () => {
        const h = harness();
        const a = h.queue.ask("a", "pa")!;
        h.queue.ask("b", "pb");
        const c = h.queue.ask("c", "pc")!;
        h.queue.dispose();
        h.calls[0].d.resolve("late");
        h.calls[1].d.resolve("late");
        await tick();
        expect(await a.result).toEqual({ kind: "discarded" });
        expect(await c.result).toEqual({ kind: "discarded" });
        expect(h.complete).toHaveBeenCalledTimes(2);
        expect(h.queue.ask("d", "pd")).toBeNull();
    });

    it("maps a time-out, a status and anything else to their kind, and never retries", async () => {
        const h = harness();
        const a = h.queue.ask("a", "pa")!;
        h.calls[0].d.reject(new Error("AI request timed out after 30000ms"));
        expect(await a.result).toEqual({ kind: "failed", failure: { kind: "timeout" } });
        const b = h.queue.ask("b", "pb")!;
        h.calls[1].d.reject(new Error("AI request failed with status 429"));
        expect(await b.result).toEqual({ kind: "failed", failure: { kind: "status", status: 429 } });
        const c = h.queue.ask("c", "pc")!;
        h.calls[2].d.reject(new Error("socket hang up"));
        expect(await c.result).toEqual({ kind: "failed", failure: { kind: "failed" } });
        await tick();
        expect(h.complete).toHaveBeenCalledTimes(3);
        // Try again is a new click: the same key may be asked again once it settled.
        expect(h.queue.ask("a", "pa")).not.toBeNull();
        expect(h.complete).toHaveBeenCalledTimes(4);
    });

    it("classifies a thrown provider the same way", async () => {
        expect(classifyAiFailure("weird")).toEqual({ kind: "failed" });
        const queue = new ReaderAiQueue(() => {
            throw new Error("AI request failed with status 401");
        });
        expect(await queue.ask("a", "p")!.result).toEqual({ kind: "failed", failure: { kind: "status", status: 401 } });
    });
});

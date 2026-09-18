import { describe, it, expect } from "@jest/globals";
import { DEFAULT_YIELD_EVERY, runLongPass, type LongPassProgress } from "architecture/monitoring/longPass";

const items = Array.from({ length: 200 }, (_, index) => index);

describe("a pass that yields, reports and can be stopped (#462)", () => {
    it("does every item and says so", async () => {
        const applied: number[] = [];
        const result = await runLongPass([1, 2, 3], (n) => {
            applied.push(n);
        });
        expect(applied).toEqual([1, 2, 3]);
        expect(result.done).toEqual([1, 2, 3]);
        expect(result.cancelled).toBe(false);
    });

    it("reports progress at the yield boundary, not per item", async () => {
        const progress: LongPassProgress[] = [];
        await runLongPass(items.slice(0, 120), () => undefined, {
            yieldEvery: 50,
            onProgress: (p) => progress.push(p),
        });
        // Two boundaries plus the final report — never 120 callbacks, which would cost more than
        // the work being reported on.
        expect(progress.map((p) => p.done)).toEqual([50, 100, 120]);
        expect(progress[0].total).toBe(120);
    });

    it("reports once even when there was nothing to do", async () => {
        const progress: LongPassProgress[] = [];
        await runLongPass([], () => undefined, { onProgress: (p) => progress.push(p) });
        expect(progress).toEqual([{ done: 0, total: 0 }]);
    });

    it("stops promptly when cancelled, with every finished item finished", async () => {
        const controller = new AbortController();
        const applied: number[] = [];
        const result = await runLongPass(items, (n) => {
            applied.push(n);
            if (n === 9) controller.abort();
        }, { signal: controller.signal });

        expect(result.cancelled).toBe(true);
        // Items 0..9 ran and are complete; 10 onwards were never started. Nothing is half-applied,
        // which is what makes cancelling safe rather than merely possible.
        expect(applied).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(result.done).toEqual(applied);
    });

    it("does nothing when it was cancelled before it started", async () => {
        const controller = new AbortController();
        controller.abort();
        const applied: number[] = [];
        const result = await runLongPass(items, (n) => void applied.push(n), { signal: controller.signal });
        expect(applied).toEqual([]);
        expect(result.cancelled).toBe(true);
    });

    it("counts an item that threw and carries on", async () => {
        const result = await runLongPass([1, 2, 3], (n) => {
            if (n === 2) throw new Error("unreadable");
        });
        // One unreadable note must not lose the other forty-nine thousand.
        expect(result.done).toEqual([1, 3]);
        expect(result.failed).toBe(1);
        expect(result.cancelled).toBe(false);
    });

    it("awaits asynchronous work, rather than firing it and moving on", async () => {
        const order: string[] = [];
        await runLongPass([1, 2], async (n) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push(`done ${n}`);
        });
        expect(order).toEqual(["done 1", "done 2"]);
    });

    it("yields often enough by default that a long pass stays responsive", () => {
        expect(DEFAULT_YIELD_EVERY).toBeLessThanOrEqual(50);
    });
});

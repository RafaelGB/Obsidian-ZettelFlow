import { describe, it, expect, beforeEach } from "@jest/globals";
import {
    clearSamples,
    lastSample,
    MAX_SAMPLES,
    measure,
    measureAsync,
    sampleCount,
    samples,
    stopwatch,
    type Measurable,
} from "architecture/monitoring/measure";

const INDEX_BUILD: Measurable = "index.build";
const DERIVE_ONE: Measurable = "derive.one";

describe("one instrument, used by the app and by the budgets (#457)", () => {
    beforeEach(() => {
        clearSamples();
    });

    it("gives back what the work returned", () => {
        expect(measure(INDEX_BUILD, () => 42)).toBe(42);
    });

    it("records the name, a duration and when it happened", () => {
        measure(INDEX_BUILD, () => 1);
        const sample = lastSample(INDEX_BUILD);
        expect(sample?.name).toBe(INDEX_BUILD);
        expect(sample?.ms).toBeGreaterThanOrEqual(0);
        expect(sample?.at).toBeGreaterThan(0);
    });

    it("records what the work was measured over, when it says", () => {
        measure(INDEX_BUILD, () => 1, { scale: 50_000 });
        expect(lastSample(INDEX_BUILD)?.scale).toBe(50_000);
    });

    it("records a failure and lets it through untouched", () => {
        expect(() =>
            measure(INDEX_BUILD, () => {
                throw new Error("the build failed");
            })
        ).toThrow("the build failed");
        // A pass that died after eight seconds is the most interesting timing there is; losing it
        // because it threw would be exactly backwards.
        expect(lastSample(INDEX_BUILD)?.ok).toBe(false);
    });

    it("awaits asynchronous work rather than timing the promise's creation", async () => {
        const result = await measureAsync(INDEX_BUILD, async () => {
            await new Promise((resolve) => setTimeout(resolve, 12));
            return "done";
        });
        expect(result).toBe("done");
        expect(lastSample(INDEX_BUILD)?.ms).toBeGreaterThanOrEqual(10);
    });

    it("records an asynchronous failure too, and rejects", async () => {
        await expect(
            measureAsync(INDEX_BUILD, () => Promise.reject(new Error("no")))
        ).rejects.toThrow("no");
        expect(lastSample(INDEX_BUILD)?.ok).toBe(false);
    });

    it("keeps the newest sample of each name, not the first", () => {
        measure(DERIVE_ONE, () => 1, { scale: 1 });
        measure(DERIVE_ONE, () => 1, { scale: 2 });
        expect(lastSample(DERIVE_ONE)?.scale).toBe(2);
    });

    it("says nothing about a name it has never seen, rather than zero", () => {
        expect(lastSample(DERIVE_ONE)).toBeUndefined();
    });

    it("is bounded: a long session cannot grow it without limit", () => {
        for (let index = 0; index < MAX_SAMPLES + 50; index++) measure(DERIVE_ONE, () => index);
        expect(samples()).toHaveLength(MAX_SAMPLES);
        // Oldest first out, so what is kept is what just happened.
        expect(samples()[samples().length - 1].name).toBe(DERIVE_ONE);
    });

    it("can be emptied, which is what a test between two runs needs", () => {
        measure(DERIVE_ONE, () => 1);
        clearSamples();
        expect(samples()).toEqual([]);
    });
});

describe("a flood of page turns forgets nothing (#825)", () => {
    beforeEach(() => {
        clearSamples();
    });

    it("keeps the start-up row after a thousand Reader samples", () => {
        measure("plugin.load", () => 1);
        for (let index = 0; index < 1000; index++) measure("reader.page.turn", () => index);
        expect(lastSample("plugin.load")).toBeDefined();
        expect(samples()).toHaveLength(MAX_SAMPLES);
    });

    it("counts each kind, and an unmeasured kind is zero", () => {
        for (let index = 0; index < 1000; index++) measure("reader.page.turn", () => index);
        expect(sampleCount("reader.page.turn")).toBe(1000);
        expect(sampleCount("reader.relayout")).toBe(0);
    });

    it("times work that spans awaits, and an abandoned one records nothing", () => {
        const kept = stopwatch("reader.chapter.open");
        kept.done();
        kept.done();
        expect(sampleCount("reader.chapter.open")).toBe(1);
        const overtaken = stopwatch("reader.chapter.open");
        overtaken.abandon();
        overtaken.done();
        expect(sampleCount("reader.chapter.open")).toBe(1);
        expect(lastSample("reader.chapter.open")?.scale).toBeUndefined();
    });

    it("empties the counts and the latest of each kind too", () => {
        measure("plugin.load", () => 1);
        measure("reader.page.turn", () => 1);
        clearSamples();
        expect(sampleCount("reader.page.turn")).toBe(0);
        expect(lastSample("plugin.load")).toBeUndefined();
    });
});

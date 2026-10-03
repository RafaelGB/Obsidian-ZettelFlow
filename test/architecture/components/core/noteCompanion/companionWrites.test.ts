import { describe, it, expect, afterEach } from "@jest/globals";
import {
    companionWriting,
    queueCompanionWrite,
    resetCompanionWrites,
} from "architecture/components/core/noteCompanion/companionWrites";

afterEach(() => resetCompanionWrites());

/**
 * One companion write at a time (#639 runtime audit): two quick writes into the same note used to
 * read the same content, and the second dropped the first.
 */
describe("the companion's write queue", () => {
    it("runs writes one after another, in the order they were asked for", async () => {
        const order: string[] = [];
        let releaseFirst: () => void = () => undefined;
        const first = queueCompanionWrite(async () => {
            order.push("first starts");
            await new Promise<void>((resolve) => (releaseFirst = resolve));
            order.push("first ends");
        });
        const second = queueCompanionWrite(async () => {
            order.push("second");
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(order).toEqual(["first starts"]);
        releaseFirst();
        await Promise.all([first, second]);
        expect(order).toEqual(["first starts", "first ends", "second"]);
    });

    it("keeps going after a write that failed, and hands back each write's own result", async () => {
        const failed = queueCompanionWrite(async () => {
            throw new Error("disk");
        });
        const ok = queueCompanionWrite(async () => 42);
        await expect(failed).rejects.toThrow("disk");
        await expect(ok).resolves.toBe(42);
    });

    it("says whether it is writing", async () => {
        expect(companionWriting()).toBe(false);
        const write = queueCompanionWrite(async () => undefined);
        expect(companionWriting()).toBe(true);
        await write;
        expect(companionWriting()).toBe(false);
    });
});

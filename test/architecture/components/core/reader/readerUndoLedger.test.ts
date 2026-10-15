import { describe, it, expect } from "@jest/globals";
import { UndoLedger } from "architecture/components/core/reader/readerUndoLedger";

describe("the reading's undo ledger (#810 FR-15–FR-18)", () => {
    it("takes the newest write first, one at a time, back to the start", async () => {
        const ledger = new UndoLedger();
        const done: string[] = [];
        ledger.offer(() => done.push("highlight"));
        ledger.offer(() => done.push("meaning"));
        ledger.offer(() => done.push("note"));
        for (let i = 0; i < 3; i++) await ledger.takeLast()?.();
        expect(done).toEqual(["note", "meaning", "highlight"]);
        expect(ledger.takeLast()).toBeNull();
    });

    it("shares one guard between the button and the key: nothing is taken back twice (FR-17)", async () => {
        const ledger = new UndoLedger();
        const done: string[] = [];
        ledger.offer(() => done.push("first"));
        const button = ledger.offer(() => done.push("second"));
        expect(await button()).toBe("undone");
        expect(await button()).toBe("spent");
        await ledger.takeLast()?.();
        expect(done).toEqual(["second", "first"]);
    });

    it("refuses a write changed since, and counts it as handled (FR-18)", async () => {
        const ledger = new UndoLedger();
        const done: string[] = [];
        ledger.offer(() => done.push("older"));
        ledger.offer(() => done.push("edited in Think"), async () => false);
        expect(await ledger.takeLast()?.()).toBe("refused");
        expect(await ledger.takeLast()?.()).toBe("undone");
        expect(done).toEqual(["older"]);
    });

    it("forgets everything when a reading opens or the Reader closes", () => {
        const ledger = new UndoLedger();
        ledger.offer(() => undefined);
        ledger.reset();
        expect(ledger.takeLast()).toBeNull();
        expect(ledger.pending()).toBe(0);
    });
});

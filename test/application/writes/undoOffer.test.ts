import { describe, it, expect } from "@jest/globals";
import { offerState, UNDO_OFFER_MS, worthOffering } from "application/writes/undoOffer";
import type { VaultWrite } from "application/writes/vaultWriteLog";

const NOW = 1_700_000_000_000;

function write(overrides: Partial<VaultWrite> = {}): VaultWrite {
    return {
        id: "w1",
        batch: "b1",
        at: NOW,
        kind: "properties-set",
        path: "Notes/one.md",
        origin: { kind: "hook", ref: "hook:status" },
        before: { status: "seed" },
        after: { status: "grown" },
        ...overrides,
    };
}

describe("an undo offered in the moment (#455)", () => {
    it("lives for thirty seconds", () => {
        expect(UNDO_OFFER_MS).toBe(30_000);
    });

    it("is live the instant it is made", () => {
        expect(offerState(NOW, NOW)).toBe("live");
    });

    it("is still live a millisecond before it expires", () => {
        expect(offerState(NOW, NOW + UNDO_OFFER_MS - 1)).toBe("live");
    });

    it("is expired on the boundary and after it", () => {
        expect(offerState(NOW, NOW + UNDO_OFFER_MS)).toBe("expired");
        expect(offerState(NOW, NOW + UNDO_OFFER_MS + 60_000)).toBe("expired");
    });

    it("treats a clock that went backwards as still live, rather than as expired", () => {
        // A system clock correction must not silently swallow an offer you can see on screen.
        expect(offerState(NOW, NOW - 5_000)).toBe("live");
    });
});

describe("what is worth offering an undo for (#455)", () => {
    it("offers one for a property a hook actually changed", () => {
        expect(worthOffering([write()])).toBe(true);
    });

    it("offers none when the hook wrote nothing", () => {
        // The common case for an idempotent hook: it set a property to the value it already had,
        // so no write was recorded and there is nothing to take back.
        expect(worthOffering([])).toBe(false);
    });

    it("offers none for a change that cannot be taken back", () => {
        expect(worthOffering([write({ kind: "content-replaced", before: undefined, after: undefined })])).toBe(false);
    });

    it("offers none for something already taken back", () => {
        expect(worthOffering([write({ undone: NOW })])).toBe(false);
    });

    it("offers one when at least one of several writes can be reversed", () => {
        expect(
            worthOffering([write({ kind: "content-replaced", before: undefined, after: undefined }), write({ id: "w2" })])
        ).toBe(true);
    });
});

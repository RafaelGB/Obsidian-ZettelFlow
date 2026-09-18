import { describe, it, expect } from "@jest/globals";
import {
    recordVaultWrite,
    withWriteBatch,
    currentWriteOrigin,
    type VaultWriteSink,
} from "architecture/plugin/writes/recordVaultWrite";
import type { VaultWrite } from "application/writes/vaultWriteLog";

function sink(overrides: Partial<VaultWriteSink> = {}) {
    let state = { writes: [] as VaultWrite[] };
    let clock = 1_000;
    let ids = 0;
    return {
        read: () => state,
        write: (next: typeof state) => {
            state = next;
        },
        now: () => (clock += 5),
        id: () => `id-${ids++}`,
        ...overrides,
        get state() {
            return state;
        },
    } as VaultWriteSink & { state: { writes: VaultWrite[] } };
}

describe("the recorder writes a fact down (#453)", () => {
    it("keeps what changed, where, and who did it", () => {
        const store = sink();
        recordVaultWrite(
            {
                kind: "note-created",
                path: "Notes/one.md",
                origin: { kind: "flow", ref: "flows/create.canvas", step: "s1" },
            },
            store
        );
        expect(store.state.writes).toHaveLength(1);
        expect(store.state.writes[0]).toMatchObject({
            kind: "note-created",
            path: "Notes/one.md",
            origin: { kind: "flow", ref: "flows/create.canvas", step: "s1" },
        });
    });

    it("keeps only the touched keys of a property change, with both values", () => {
        const store = sink();
        recordVaultWrite(
            {
                kind: "properties-set",
                path: "Notes/one.md",
                origin: { kind: "hook", ref: "hook:status" },
                before: { status: "seed", untouched: "keep me" },
                after: { status: "grown" },
            },
            store
        );
        const entry = store.state.writes[0];
        expect(entry.after).toEqual({ status: "grown" });
        // `before` is narrowed to the keys that were actually written — the rest of the note's
        // frontmatter is none of the record's business.
        expect(entry.before).toEqual({ status: "seed" });
    });

    it("records a key the note did not have as absent, not as missing from the record", () => {
        const store = sink();
        recordVaultWrite(
            {
                kind: "properties-set",
                path: "Notes/one.md",
                origin: { kind: "action", ref: "zettel-id" },
                before: {},
                after: { id: "202601011200" },
            },
            store
        );
        // Restoring must be able to *remove* the key again, so its absence has to be recorded.
        expect(store.state.writes[0].before).toEqual({ id: undefined });
    });

    it("gives an unclaimed write an origin rather than dropping it", () => {
        const store = sink();
        recordVaultWrite({ kind: "file-created", path: "a.md" }, store);
        expect(store.state.writes[0].origin).toEqual({ kind: "unknown" });
    });

    it("never breaks the write it is observing", () => {
        const exploding = sink({
            write: () => {
                throw new Error("data.json is read-only");
            },
        });
        expect(() =>
            recordVaultWrite({ kind: "note-created", path: "Notes/one.md" }, exploding)
        ).not.toThrow();
    });

    it("survives a reader that throws too", () => {
        const exploding = sink({
            read: () => {
                throw new Error("no settings yet");
            },
        });
        expect(() => recordVaultWrite({ kind: "note-created", path: "a.md" }, exploding)).not.toThrow();
    });
});

describe("a batch is what one action did (#453)", () => {
    it("gives every write inside it the same batch id", async () => {
        const store = sink();
        await withWriteBatch({ kind: "flow", ref: "flows/create.canvas" }, async () => {
            recordVaultWrite({ kind: "note-created", path: "Notes/one.md" }, store);
            recordVaultWrite({ kind: "note-created", path: "Notes/one.satellite.md" }, store);
            recordVaultWrite(
                { kind: "properties-set", path: "Notes/one.md", before: {}, after: { status: "seed" } },
                store
            );
        });
        const batches = new Set(store.state.writes.map((write) => write.batch));
        expect(batches.size).toBe(1);
        expect(store.state.writes).toHaveLength(3);
    });

    it("inherits the origin, so a call site does not invent a label", async () => {
        const store = sink();
        await withWriteBatch({ kind: "flow", ref: "flows/create.canvas", step: "s2" }, async () => {
            recordVaultWrite({ kind: "note-created", path: "Notes/one.md" }, store);
        });
        expect(store.state.writes[0].origin).toEqual({
            kind: "flow",
            ref: "flows/create.canvas",
            step: "s2",
        });
    });

    it("lets a write name itself more precisely than the batch does", async () => {
        const store = sink();
        await withWriteBatch({ kind: "flow", ref: "flows/create.canvas" }, async () => {
            recordVaultWrite(
                { kind: "properties-set", path: "a.md", origin: { kind: "action", ref: "zettel-id" } },
                store
            );
        });
        expect(store.state.writes[0].origin.kind).toBe("action");
    });

    it("keeps the outer batch when batches nest", async () => {
        const store = sink();
        await withWriteBatch({ kind: "flow", ref: "outer" }, async () => {
            recordVaultWrite({ kind: "note-created", path: "a.md" }, store);
            await withWriteBatch({ kind: "action", ref: "inner" }, async () => {
                recordVaultWrite({ kind: "note-created", path: "b.md" }, store);
            });
        });
        const batches = new Set(store.state.writes.map((write) => write.batch));
        expect(batches.size).toBe(1);
        // The inner origin is still the more accurate answer to "who wrote b.md".
        expect(store.state.writes[0].origin.ref).toBe("inner");
    });

    it("gives a write with no batch around it one of its own", () => {
        const store = sink();
        recordVaultWrite({ kind: "note-created", path: "a.md" }, store);
        recordVaultWrite({ kind: "note-created", path: "b.md" }, store);
        expect(store.state.writes[0].batch).not.toBe(store.state.writes[1].batch);
    });

    it("returns what the work returned, and lets its failure through", async () => {
        await expect(withWriteBatch({ kind: "flow" }, async () => 42)).resolves.toBe(42);
        await expect(
            withWriteBatch({ kind: "flow" }, async () => {
                throw new Error("the flow failed");
            })
        ).rejects.toThrow("the flow failed");
    });

    it("clears the batch afterwards, even when the work threw", async () => {
        await withWriteBatch({ kind: "flow", ref: "a" }, async () => undefined);
        expect(currentWriteOrigin()).toBeUndefined();
        await withWriteBatch({ kind: "flow", ref: "b" }, async () => {
            throw new Error("boom");
        }).catch(() => undefined);
        expect(currentWriteOrigin()).toBeUndefined();
    });
});

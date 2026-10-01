import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, DataStoreSnapshot, FieldDescriptor } from "dashboards/datastore";
import { ComputedResolver, offlineZf, type OfflineZf, type ResolverDeps } from "dashboards/base/scriptTransform";

const props: FieldDescriptor[] = [{ id: "note.n", name: "N" }];
function snap(sig: string): DataStoreSnapshot {
    const entries: AdaptedEntry[] = [
        { path: "a.md", cells: { "note.n": { kind: "number", display: "2", raw: 2 } } },
        { path: "b.md", cells: { "note.n": { kind: "number", display: "4", raw: 4 } } },
    ];
    return normalize(entries, props, sig);
}
const COMPUTED = { enabled: true, code: "return rows" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoreCompile = () => async (rows: any) => rows.map((r: any) => ({ ...r, score: r["note.n"] * 10 }));

function makeDeps(over: Partial<ResolverDeps> = {}): { deps: ResolverDeps; records: { ok: boolean }[] } {
    const records: { ok: boolean }[] = [];
    const zfStub: OfflineZf = { knowledge: {}, internal: { vault: {} } };
    const deps: ResolverDeps = {
        loadZf: async () => zfStub,
        compile: scoreCompile,
        record: (ok) => records.push({ ok }),
        ...over,
    };
    return { deps, records };
}

describe("ComputedResolver (#632)", () => {
    it("enriches the snapshot and caches it under the signature key (AC-4)", async () => {
        const { deps } = makeDeps();
        const resolver = new ComputedResolver(deps);
        const first = await resolver.resolve(snap("s1"), COMPUTED);
        expect(first.error).toBeNull();
        expect(first.snapshot.schema.byId["score"]?.type).toBe("number");
        const second = await resolver.resolve(snap("s1"), COMPUTED);
        expect(second.snapshot).toBe(first.snapshot); // reused from cache, not re-run
    });

    it("records exactly one run on success and on failure (AC-5)", async () => {
        const ok = makeDeps();
        await new ComputedResolver(ok.deps).resolve(snap("a"), COMPUTED);
        expect(ok.records).toEqual([{ ok: true }]);

        const bad = makeDeps({ compile: () => async () => { throw new Error("boom"); } });
        const resolver = new ComputedResolver(bad.deps);
        const result = await resolver.resolve(snap("b"), COMPUTED);
        expect(result.error).toBe("boom");
        expect(result.snapshot.schema.byId["score"]).toBeUndefined(); // un-enriched input returned
        expect(bad.records).toEqual([{ ok: false }]);
    });

    it("is a no-op (passthrough) when disabled or empty (AC-7)", async () => {
        const { deps, records } = makeDeps();
        const resolver = new ComputedResolver(deps);
        const base = snap("s");
        expect((await resolver.resolve(base, { enabled: false, code: "return rows" })).snapshot).toBe(base);
        expect((await resolver.resolve(base, { enabled: true, code: "   " })).snapshot).toBe(base);
        expect(records).toEqual([]); // nothing ran, nothing recorded
    });

    it("supersedes a stale resolve — an out-of-order settle never paints stale enrichment (AC-4)", async () => {
        let release = (): void => undefined;
        const gate = new Promise<void>((res) => (release = res));
        let call = 0;
        const { deps } = makeDeps({
            loadZf: async () => {
                call += 1;
                if (call === 1) await gate; // the first resolve is held open
                return { knowledge: {}, internal: { vault: {} } };
            },
        });
        const resolver = new ComputedResolver(deps);
        const sA = snap("A");
        const pA = resolver.resolve(sA, COMPUTED); // held at loadZf
        const pB = resolver.resolve(snap("B"), COMPUTED); // supersedes A's pending key
        await pB;
        release();
        const rA = await pA;
        expect(rA.snapshot).toBe(sA); // discarded — returns its own input, not stale enrichment
    });
});

describe("offlineZf", () => {
    it("drops ai/network and external; keeps knowledge + vault reads (AC-6)", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const full = { knowledge: { k: 1 }, internal: { vault: { v: 1 } }, ai: { a: 1 }, external: {} } as any;
        const result = offlineZf(full);
        expect(result).toEqual({ knowledge: { k: 1 }, internal: { vault: { v: 1 } } });
        expect("ai" in result).toBe(false);
    });
});

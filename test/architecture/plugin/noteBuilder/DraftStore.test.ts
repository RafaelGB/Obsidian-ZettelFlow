import { describe, it, expect, beforeEach } from "@jest/globals";
import { DraftStore, DraftHost } from "architecture/plugin/noteBuilder/DraftStore";
import { DRAFT_VERSION, MAX_DRAFTS } from "application/notes/draftState";

function snapshot(canvasPath = "flows/main.canvas", savedAt = 5000) {
    return {
        canvasPath,
        savedAt,
        title: "Atomicity",
        position: 2,
        targetFolder: "zettel",
        walked: [{ position: 0, nodeId: "root", title: "Type" }],
        paths: new Map([[0, "steps/type.md"]]),
        elements: new Map(),
        links: [],
        onCreation: [],
    };
}

function harness(overrides: Partial<DraftHost> = {}) {
    const state: { stored: unknown; persists: number } = { stored: undefined, persists: 0 };
    const host: DraftHost = {
        read: () => state.stored,
        write: (value) => {
            state.stored = value;
        },
        enabled: () => true,
        canvasExists: () => true,
        persist: async () => {
            state.persists += 1;
        },
        now: () => 5000,
        ...overrides,
    };
    const store = new (DraftStore as unknown as { new (): DraftStore })();
    store.init(host);
    return { store, state };
}

describe("the draft store keeps unfinished work without ever destroying data (#410)", () => {
    let harnessed: ReturnType<typeof harness>;

    beforeEach(() => {
        harnessed = harness();
    });

    it("offers back what it saved", () => {
        harnessed.store.save(snapshot());
        expect(harnessed.store.offer("flows/main.canvas")?.title).toBe("Atomicity");
        expect(harnessed.state.persists).toBe(1);
    });

    it("offers nothing for a canvas with no draft", () => {
        harnessed.store.save(snapshot());
        expect(harnessed.store.offer("flows/other.canvas")).toBeUndefined();
    });

    it("writes nothing at all when drafts are off", () => {
        const off = harness({ enabled: () => false });
        off.store.save(snapshot());
        expect(off.state.stored).toBeUndefined();
        expect(off.state.persists).toBe(0);
        expect(off.store.offer("flows/main.canvas")).toBeUndefined();
    });

    it("forgets a draft once the note is created", () => {
        harnessed.store.save(snapshot());
        harnessed.store.clear("flows/main.canvas");
        expect(harnessed.store.offer("flows/main.canvas")).toBeUndefined();
    });

    it("keeps an unparseable blob instead of deleting it", () => {
        const weird = { version: 99, mystery: true };
        const kept = harness();
        kept.state.stored = [weird];
        expect(kept.store.offer("flows/main.canvas")).toBeUndefined();
        kept.store.clear("flows/main.canvas");
        expect(kept.state.stored).toEqual([weird]);
        expect(kept.state.persists).toBe(0);
    });

    it("does not offer a draft whose canvas has gone", () => {
        const gone = harness({ canvasExists: () => false });
        gone.store.save(snapshot());
        expect(gone.store.offer("flows/main.canvas")).toBeUndefined();
    });

    it("does not offer a draft older than the maximum age", () => {
        const old = harness({ now: () => 5000 });
        old.store.save(snapshot("flows/main.canvas", 1));
        const later = harness({
            now: () => 1 + 31 * 24 * 60 * 60 * 1000,
            read: () => old.state.stored,
        });
        expect(later.store.offer("flows/main.canvas")).toBeUndefined();
    });

    it("caps how many canvases keep a draft", () => {
        for (let i = 0; i < MAX_DRAFTS + 3; i++) {
            harnessed.store.save(snapshot(`c${i}.canvas`, 5000 + i));
        }
        expect((harnessed.state.stored as unknown[]).length).toBe(MAX_DRAFTS);
        expect(harnessed.store.offer("c0.canvas")).toBeUndefined();
    });

    it("saves nothing for a session with no work in it", () => {
        harnessed.store.save({
            ...snapshot(),
            title: "",
            walked: [],
            paths: new Map(),
        });
        expect(harnessed.state.stored).toBeUndefined();
    });

    it("does nothing at all before init — the load-time trap of #374", () => {
        const store = new (DraftStore as unknown as { new (): DraftStore })();
        expect(store.offer("flows/main.canvas")).toBeUndefined();
        expect(() => store.save(snapshot())).not.toThrow();
        expect(() => store.clear("flows/main.canvas")).not.toThrow();
    });

    it("writes drafts of the current version", () => {
        harnessed.store.save(snapshot());
        expect((harnessed.state.stored as { version: number }[])[0].version).toBe(DRAFT_VERSION);
    });
});

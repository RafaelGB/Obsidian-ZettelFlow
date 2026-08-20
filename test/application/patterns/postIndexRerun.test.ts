import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { __setMockObsidianApi } from "architecture";
import { PostIndexRerun } from "application/patterns/PostIndexRerun";
import type { Action } from "architecture/api";
import type { TFile } from "obsidian";

const action = (type: string): Action => ({ type, id: type, hasUI: false, key: type, zone: "frontmatter" });
const file = (path: string): TFile => ({ path } as unknown as TFile);

/** A settable `metadataCache` stub that records `on`/`offref` and lets a test fire `resolve`. */
function makeMetadataCache() {
    const handlers = new Map<object, { name: string; cb: (file: unknown) => void }>();
    const cache = {
        resolvedLinks: {} as Record<string, unknown>,
        on: jest.fn((name: string, cb: (file: unknown) => void) => {
            const ref = {};
            handlers.set(ref, { name, cb });
            return ref;
        }),
        offref: jest.fn((ref: object) => {
            handlers.delete(ref);
        }),
        /** test-only: fire a named event to every live handler */
        fire(name: string, payload: unknown) {
            for (const { name: n, cb } of Array.from(handlers.values())) if (n === name) cb(payload);
        },
        /** test-only: number of live (not-yet-offref'd) handlers */
        liveHandlers() {
            return handlers.size;
        },
    };
    return cache;
}

let metadataCache: ReturnType<typeof makeMetadataCache>;

beforeEach(() => {
    jest.useFakeTimers();
    metadataCache = makeMetadataCache();
    __setMockObsidianApi({ metadataCache: metadataCache as never });
});

afterEach(() => {
    jest.useRealTimers();
});

/** Mark a path as indexed-with-resolved-links, then fire the per-file `resolve` signal for it. */
function resolvePath(cache: ReturnType<typeof makeMetadataCache>, path: string) {
    cache.resolvedLinks[path] = {};
    cache.fire("resolve", file(path));
}

describe("PostIndexRerun.arm — disabled / empty-list no-op (#200, FR-5, AC-3)", () => {
    it("does nothing when the re-run is disabled", () => {
        const runner = jest.fn(async () => undefined);
        const setTimeoutSpy = jest.spyOn(window, "setTimeout");

        PostIndexRerun.getInstance().arm(file("disabled/Note.md"), [action("find-related")], false, runner);

        expect(runner).not.toHaveBeenCalled();
        expect(metadataCache.on).not.toHaveBeenCalled();
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it("does nothing when the pattern has no on-creation actions", () => {
        const runner = jest.fn(async () => undefined);
        const setTimeoutSpy = jest.spyOn(window, "setTimeout");

        PostIndexRerun.getInstance().arm(file("empty/Note.md"), [], true, runner);

        expect(runner).not.toHaveBeenCalled();
        expect(metadataCache.on).not.toHaveBeenCalled();
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
});

describe("PostIndexRerun.arm — one-shot resolve → run once, then offref (#200, FR-1/2/3, AC-2)", () => {
    it("runs the re-run exactly once and unsubscribes after the note resolves", () => {
        const path = "run-once/Note.md";
        const actions = [action("find-related")];
        const runner = jest.fn(async () => undefined);

        PostIndexRerun.getInstance().arm(file(path), actions, true, runner);
        expect(metadataCache.on).toHaveBeenCalledWith("resolve", expect.any(Function));
        expect(metadataCache.liveHandlers()).toBe(1);

        // The note gets indexed → fire resolve once.
        resolvePath(metadataCache, path);
        expect(runner).toHaveBeenCalledTimes(1);
        expect(runner).toHaveBeenCalledWith(expect.objectContaining({ path }), actions);
        expect(metadataCache.liveHandlers()).toBe(0);

        // The re-run's own frontmatter write re-indexes the note → a second resolve must NOT re-run.
        resolvePath(metadataCache, path);
        expect(runner).toHaveBeenCalledTimes(1);
    });

    it("ignores resolve for a different path and stays armed until its own note resolves", () => {
        const path = "gated/Note.md";
        const runner = jest.fn(async () => undefined);

        PostIndexRerun.getInstance().arm(file(path), [action("find-related")], true, runner);

        resolvePath(metadataCache, "some/Other.md");
        expect(runner).not.toHaveBeenCalled();
        expect(metadataCache.liveHandlers()).toBe(1);

        resolvePath(metadataCache, path);
        expect(runner).toHaveBeenCalledTimes(1);
    });

    it("does not fire until the note's links are actually resolved", () => {
        const path = "not-ready/Note.md";
        const runner = jest.fn(async () => undefined);

        PostIndexRerun.getInstance().arm(file(path), [action("find-related")], true, runner);

        // resolve fires but resolvedLinks has no entry yet → not ready.
        metadataCache.fire("resolve", file(path));
        expect(runner).not.toHaveBeenCalled();
        expect(metadataCache.liveHandlers()).toBe(1);
    });
});

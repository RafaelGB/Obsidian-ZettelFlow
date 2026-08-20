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
    metadataCache = makeMetadataCache();
    __setMockObsidianApi({ metadataCache: metadataCache as never });
});

afterEach(() => {
    jest.useRealTimers();
});

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

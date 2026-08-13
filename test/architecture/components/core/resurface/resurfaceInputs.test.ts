import { describe, it, expect, beforeEach } from "@jest/globals";
import type { App } from "obsidian";
import {
    buildResurfaceInputs,
    clearResurfaceInputsCache,
} from "architecture/components/core/resurface/resurfaceInputs";

/** Minimal App mock; counts getFileCache calls so we can prove the whole-vault build is memoized. */
function mockApp(paths: string[]): { app: App; cacheReads: () => number } {
    let cacheReads = 0;
    const files = paths.map((path) => ({ path, basename: path.replace(/\.md$/, ""), stat: { mtime: 0 } }));
    const app = {
        vault: { getMarkdownFiles: () => files },
        metadataCache: {
            resolvedLinks: {},
            getFileCache: () => {
                cacheReads++;
                return null;
            },
        },
    } as unknown as App;
    return { app, cacheReads: () => cacheReads };
}

describe("buildResurfaceInputs caching (#246 C1)", () => {
    beforeEach(() => clearResurfaceInputsCache());

    it("builds candidates for every markdown file on a cold call", () => {
        const { app, cacheReads } = mockApp(["a.md", "b.md", "c.md"]);
        const inputs = buildResurfaceInputs(app);
        expect(inputs.candidates).toHaveLength(3);
        expect(cacheReads()).toBe(3); // one metadata read per file
    });

    it("reuses the memoized build on a second call within the TTL (no rebuild)", () => {
        const { app, cacheReads } = mockApp(["a.md", "b.md"]);
        const first = buildResurfaceInputs(app);
        const second = buildResurfaceInputs(app);
        expect(second.candidates).toBe(first.candidates); // same reference = cache hit
        expect(cacheReads()).toBe(2); // NOT rebuilt on the second call
    });

    it("rebuilds when the markdown-file count changes (add/remove)", () => {
        const { app, cacheReads } = mockApp(["a.md"]);
        buildResurfaceInputs(app);
        const grown = mockApp(["a.md", "b.md"]);
        const inputs = buildResurfaceInputs(grown.app);
        expect(inputs.candidates).toHaveLength(2);
        // The first build read 1 file; a different file count forces a fresh build on the new app.
        expect(cacheReads()).toBe(1);
        expect(grown.cacheReads()).toBe(2);
    });
});

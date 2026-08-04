/**
 * Regression suite for FlowImpl file-node root detection.
 *
 * Scenarios covered:
 *   A. Warm cache with root:true   → node returned (existing happy path)
 *   B. Cache MISS, disk has root   → node returned (fixes race / stale install)
 *   C. Cache MISS, no disk root    → node NOT returned
 *   D. Warm cache, no root         → node NOT returned, no disk read
 *   E. File missing in vault       → throws
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { FlowImpl } from "architecture/plugin/canvas/Flows";
import { __setMockObsidianApi } from "architecture";
import { TFile } from "obsidian";
import type { CanvasData } from "obsidian/canvas";

// ─── fixtures ────────────────────────────────────────────────────────────────

const fakeCanvasFile = Object.assign(Object.create(TFile.prototype) as TFile, {
    path: "flow.canvas",
    basename: "flow",
    extension: "canvas",
});

const fakeStepFile = Object.assign(Object.create(TFile.prototype) as TFile, {
    path: "step.md",
    basename: "step",
    extension: "md",
});

/** Raw .md content with correct zettelFlowSettings frontmatter. */
const ROOT_CONTENT = [
    "---",
    "zettelFlowSettings:",
    "  root: true",
    "  label: Test",
    "---",
    "",
    "# body",
].join("\n");

/** Raw .md content that has NO frontmatter at all (the old broken onboarding). */
const NO_FRONTMATTER_CONTENT = "# just body\n";

/** Raw .md content with frontmatter but root explicitly false. */
const NOT_ROOT_CONTENT = [
    "---",
    "zettelFlowSettings:",
    "  root: false",
    "  label: Test",
    "---",
].join("\n");

function makeCanvas(stepPath = "step.md"): CanvasData {
    return {
        nodes: [
            {
                id: "file-node-1",
                type: "file",
                file: stepPath,
                x: 0,
                y: 0,
                width: 300,
                height: 100,
            },
        ],
        edges: [],
    } as unknown as CanvasData;
}

type CacheEntry = { frontmatter: Record<string, unknown> } | null;

function wireApp(opts: {
    fileExists: boolean;
    cache: CacheEntry;
    diskContent: string;
}) {
    const file = opts.fileExists ? fakeStepFile : null;
    const vault = {
        getFileByPath: jest.fn(() => file),
        cachedRead: jest.fn<() => Promise<string>>().mockResolvedValue(opts.diskContent),
    };
    const metadataCache = {
        getFileCache: jest.fn(() => opts.cache),
    };
    __setMockObsidianApi({ vault: vault as never, metadataCache: metadataCache as never });
    return { vault, metadataCache };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("FlowImpl.rootNodes — file-type nodes", () => {
    beforeEach(() => jest.clearAllMocks());

    it("A: warm cache with root:true → returns the file node", async () => {
        wireApp({
            fileExists: true,
            cache: { frontmatter: { zettelFlowSettings: { root: true, label: "Test" } } },
            diskContent: ROOT_CONTENT,
        });

        const flow = new FlowImpl(makeCanvas(), fakeCanvasFile);
        const roots = await flow.rootNodes();

        expect(roots).toHaveLength(1);
        expect(roots[0].id).toBe("file-node-1");
        expect(roots[0].root).toBe(true);
    });

    it("A: warm cache → does NOT read disk (no unnecessary I/O)", async () => {
        const { vault } = wireApp({
            fileExists: true,
            cache: { frontmatter: { zettelFlowSettings: { root: true } } },
            diskContent: ROOT_CONTENT,
        });

        const flow = new FlowImpl(makeCanvas(), fakeCanvasFile);
        await flow.rootNodes();

        expect(vault.cachedRead).not.toHaveBeenCalled();
    });

    it("B: cache MISS + disk has root:true → returns the file node (race / stale-install fix)", async () => {
        wireApp({
            fileExists: true,
            cache: null,          // MetadataCache not indexed yet
            diskContent: ROOT_CONTENT,
        });

        const flow = new FlowImpl(makeCanvas(), fakeCanvasFile);
        const roots = await flow.rootNodes();

        expect(roots).toHaveLength(1);
        expect(roots[0].id).toBe("file-node-1");
        expect(roots[0].root).toBe(true);
    });

    it("C: cache MISS + disk has NO frontmatter → returns empty (broken file)", async () => {
        wireApp({
            fileExists: true,
            cache: null,
            diskContent: NO_FRONTMATTER_CONTENT,
        });

        const flow = new FlowImpl(makeCanvas(), fakeCanvasFile);
        const roots = await flow.rootNodes();

        expect(roots).toHaveLength(0);
    });

    it("D: warm cache with root:false → returns empty, no disk read", async () => {
        const { vault } = wireApp({
            fileExists: true,
            cache: { frontmatter: { zettelFlowSettings: { root: false } } },
            diskContent: NOT_ROOT_CONTENT,
        });

        const flow = new FlowImpl(makeCanvas(), fakeCanvasFile);
        const roots = await flow.rootNodes();

        expect(roots).toHaveLength(0);
        expect(vault.cachedRead).not.toHaveBeenCalled();
    });

    it("E: file does not exist in vault → throws", async () => {
        wireApp({
            fileExists: false,
            cache: null,
            diskContent: "",
        });

        const flow = new FlowImpl(makeCanvas(), fakeCanvasFile);
        await expect(flow.rootNodes()).rejects.toThrow();
    });
});

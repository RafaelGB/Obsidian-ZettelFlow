import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { __setMockObsidianApi, log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { TFile } from "obsidian";

/**
 * T8 (#401): the inquiry journey reads the KnowledgeIndex, so any diagnostic the index emits while
 * indexing a note the user is working on must never carry that note's **path**, **body** or a **raw
 * exception message** — those are exactly the sensitive markers §XII forbids leaking into logs. This
 * suite drives the real index over a note whose path and failure text contain distinctive secrets and
 * asserts no marker reaches any log channel (we spy on `log` itself, capturing the exact arguments the
 * code passes, independent of the level routing).
 */

// Distinctive markers that must never appear in any diagnostic.
const SECRET_PATH = "Private/Therapy Notes/panic attack 2026-01.md";
const SECRET_ERROR = "db handle CREDENTIAL_tok_9f3c leaked";
const MARKERS = ["Therapy", "panic attack", "CREDENTIAL_tok_9f3c", SECRET_PATH];

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.basename = path.replace(/\.md$/, "");
    f.extension = "md";
    (f as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = { ctime: 1, mtime: 2, size: 0 };
    return f;
}

/** Faithfully render what a log channel would surface — including an Error's message/stack. */
function shown(arg: unknown): string {
    if (arg instanceof Error) return `${arg.name}: ${arg.message} ${arg.stack ?? ""}`;
    if (typeof arg === "string") return arg;
    try { return JSON.stringify(arg); } catch { return String(arg); }
}

describe("inquiry diagnostics never leak the note the user is working on (#401 T8, §XII)", () => {
    let captured: string[];
    let fetchSpy: jest.Mock;

    beforeEach(() => {
        captured = [];
        // Capture every level so a leak on any channel is observable, not just error.
        for (const level of ["error", "warn", "info", "debug", "trace"] as const) {
            jest.spyOn(log, level).mockImplementation((...args: unknown[]) => {
                captured.push(args.map(shown).join(" "));
            });
        }
        fetchSpy = jest.fn();
        (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
    });

    afterEach(() => jest.restoreAllMocks());

    function assertNoMarkers(): void {
        const blob = captured.join("\n");
        for (const marker of MARKERS) expect(blob).not.toContain(marker);
    }

    it("keeps the path out of an inline-enrichment failure diagnostic (raw error text redacted)", async () => {
        const files = [file(SECRET_PATH)];
        __setMockObsidianApi({
            vault: {
                getMarkdownFiles: () => files,
                on: jest.fn(() => ({})),
                cachedRead: jest.fn(async () => { throw new Error(SECRET_ERROR); }),
            } as never,
            metadataCache: { getFileCache: () => ({ frontmatter: {}, tags: [] }), resolvedLinks: {}, on: jest.fn(() => ({})) } as never,
            fileManager: { processFrontMatter: jest.fn() } as never,
        });
        const index = KnowledgeIndex.getInstance();
        index.build();
        await index.enrichInlineRelations();

        // The failure must still be reported — but only as a category, never the path or the raw message.
        expect(captured.some((line) => /enrichment failed/i.test(line))).toBe(true);
        assertNoMarkers();
    });

    it("keeps the path out of a per-note upsert diagnostic on the modify event", () => {
        __setMockObsidianApi({
            vault: { getMarkdownFiles: () => [], on: jest.fn(() => ({})) } as never,
            metadataCache: { getFileCache: () => ({ frontmatter: {}, tags: [] }), resolvedLinks: {}, on: jest.fn(() => ({})) } as never,
            fileManager: { processFrontMatter: jest.fn() } as never,
        });
        const index = KnowledgeIndex.getInstance();
        index.build();
        index.onModify(file(SECRET_PATH));
        assertNoMarkers();
    });

    it("does not echo note bodies into diagnostics and performs no network I/O while indexing", async () => {
        const files = [file(SECRET_PATH)];
        __setMockObsidianApi({
            vault: {
                getMarkdownFiles: () => files,
                on: jest.fn(() => ({})),
                cachedRead: jest.fn(async () => `panic attack — CREDENTIAL_tok_9f3c\nsupports:: [[Missing]]`),
            } as never,
            metadataCache: { getFileCache: () => ({ frontmatter: {}, tags: [] }), resolvedLinks: {}, getFirstLinkpathDest: () => null, on: jest.fn(() => ({})) } as never,
            fileManager: { processFrontMatter: jest.fn() } as never,
        });
        const index = KnowledgeIndex.getInstance();
        index.build();
        await index.enrichInlineRelations();
        index.onModify(files[0]);

        assertNoMarkers();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

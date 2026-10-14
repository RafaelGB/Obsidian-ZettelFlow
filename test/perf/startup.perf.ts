import { describe, it } from "@jest/globals";
import { TFile } from "obsidian";
import { __setMockObsidianApi } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { ConceptualTimeline } from "architecture/plugin/timeline/ConceptualTimeline";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * What starting costs the index (#795): bootstrap, the creation flood Obsidian announces while it
 * loads the vault, then the layout-ready build — with the conceptual timeline on and already past
 * its 200-note cap, which is where the per-note copy-and-sort used to sit.
 *
 * The metadata cache, `getMarkdownFiles` and the disk are faked, so this is the plugin's share of a
 * start, not Obsidian's. Settings › Advanced shows the real one from your vault.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.basename = path.replace(/\.md$/, "");
    f.extension = "md";
    (f as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = { ctime: 1, mtime: 2, size: 0 };
    return f;
}

describe("starting the index", () => {
    it("index.startup.10k", () => {
        const files = Array.from({ length: 10_000 }, (_, index) => file(`notes/n${index}.md`));
        const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
        const on = (name: string, handler: (...args: unknown[]) => void) => {
            handlers.set(name, [...(handlers.get(name) ?? []), handler]);
            return {};
        };
        __setMockObsidianApi({
            vault: { getMarkdownFiles: () => files, on } as never,
            metadataCache: { getFileCache: () => ({ frontmatter: {}, tags: [] }), resolvedLinks: {}, on } as never,
        });
        const snapshots: Record<string, Snapshot[]> = {};
        for (let index = 0; index < 300; index++) snapshots[`notes/n${index}.md`] = [{ at: index, state: "mature", claims: ["c"] }];
        ConceptualTimeline.getInstance().init({ settings: { timeline: { enabled: true, snapshots } }, saveSettings: () => undefined });

        const pending: (() => void)[] = [];
        const plugin = {
            settings: {},
            app: { workspace: { onLayoutReady: (callback: () => void) => pending.push(callback) } },
            registerEvent: () => undefined,
            register: () => undefined,
        };

        const started = performance.now();
        KnowledgeIndex.getInstance().bootstrap(plugin as never);
        for (const f of files) (handlers.get("create") ?? []).forEach((handler) => handler(f));
        pending.splice(0).forEach((callback) => callback());
        const ms = performance.now() - started;

        assertBudget("index.startup.10k", ms);
    });
});

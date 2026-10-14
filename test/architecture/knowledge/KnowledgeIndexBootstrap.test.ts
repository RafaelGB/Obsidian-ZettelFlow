import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { __setMockObsidianApi } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { ConceptualTimeline } from "architecture/plugin/timeline/ConceptualTimeline";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import { lastSample } from "architecture/monitoring/measure";
import { TFile } from "obsidian";

/**
 * Obsidian fires `create` for every existing file while it loads the vault (#795). The index must
 * not listen to that flood: its first state comes from one build once the layout is ready, and
 * merely starting Obsidian writes nothing to the conceptual timeline.
 */

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.basename = path.replace(/\.md$/, "");
    f.extension = "md";
    (f as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = { ctime: 1, mtime: 2, size: 0 };
    return f;
}

type Handler = (...args: unknown[]) => void;

function wire(files: TFile[], layoutReady: boolean) {
    const handlers = new Map<string, Handler[]>();
    const on = (name: string, handler: Handler) => {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
        return {};
    };
    const vault = { getMarkdownFiles: () => files, on: jest.fn(on) };
    const metadataCache = {
        getFileCache: () => ({ frontmatter: {}, tags: [] }),
        resolvedLinks: {},
        on: jest.fn((name: string, handler: Handler) => on(`cache:${name}`, handler)),
    };
    __setMockObsidianApi({ vault: vault as never, metadataCache: metadataCache as never });

    let ready = layoutReady;
    const pending: (() => void)[] = [];
    const plugin = {
        settings: {},
        app: {
            workspace: {
                onLayoutReady: (callback: () => void) => (ready ? callback() : pending.push(callback)),
            },
        },
        registerEvent: jest.fn(),
        register: jest.fn(),
    };
    const fire = (name: string, ...args: unknown[]) => (handlers.get(name) ?? []).forEach((handler) => handler(...args));
    const layoutBecomesReady = () => {
        ready = true;
        pending.splice(0).forEach((callback) => callback());
    };
    return { plugin, vault, fire, layoutBecomesReady };
}

function timelineWith(snapshots: Record<string, Snapshot[]>) {
    const host = { settings: { timeline: { enabled: true, snapshots } }, saveSettings: jest.fn() };
    ConceptualTimeline.getInstance().init(host);
    return host;
}

describe("KnowledgeIndex.bootstrap waits for the layout (#795)", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    it("listens to no vault event before the layout is ready (FR-1)", () => {
        const { plugin, vault } = wire([file("a.md")], false);
        KnowledgeIndex.getInstance().bootstrap(plugin as never);
        expect(vault.on).not.toHaveBeenCalled();
    });

    it("builds once at layout-ready from the vault, not from the creation flood (AC-1)", () => {
        const files = [file("a.md"), file("b.md"), file("c.md")];
        const { plugin, fire, layoutBecomesReady } = wire(files, false);
        const index = KnowledgeIndex.getInstance();
        const build = jest.spyOn(index, "build");
        index.bootstrap(plugin as never);

        files.forEach((f) => fire("create", f));
        expect(build).not.toHaveBeenCalled();

        layoutBecomesReady();
        fire("cache:resolved");
        expect(build).toHaveBeenCalledTimes(1);
        expect(index.status).toBe("ready");
        expect(index.model.all().map((idea) => idea.path).sort()).toEqual(["a.md", "b.md", "c.md"]);
        build.mockRestore();
    });

    it("starting Obsidian leaves the conceptual timeline untouched (AC-2)", () => {
        const files = [file("a.md"), file("b.md")];
        const stored: Record<string, Snapshot[]> = { "a.md": [{ at: 7, state: "seed", claims: [] }] };
        const host = timelineWith(stored);
        const { plugin, fire, layoutBecomesReady } = wire(files, false);
        KnowledgeIndex.getInstance().bootstrap(plugin as never);

        files.forEach((f) => fire("create", f));
        layoutBecomesReady();
        fire("cache:resolved");
        jest.runAllTimers();

        expect(host.settings.timeline.snapshots).toEqual({ "a.md": [{ at: 7, state: "seed", claims: [] }] });
        expect(host.saveSettings).not.toHaveBeenCalled();
    });

    it("measures the startup build apart from later rebuilds (FR-9)", () => {
        const { plugin, layoutBecomesReady } = wire([file("a.md"), file("b.md")], false);
        KnowledgeIndex.getInstance().bootstrap(plugin as never);
        layoutBecomesReady();
        expect(lastSample("index.startup")?.scale).toBe(2);
    });

    it("indexes a note created after the layout is ready, as before (AC-4)", () => {
        const host = timelineWith({});
        const { plugin, fire, layoutBecomesReady } = wire([file("a.md")], false);
        const index = KnowledgeIndex.getInstance();
        index.bootstrap(plugin as never);
        layoutBecomesReady();

        fire("create", file("new.md"));
        expect(index.model.get("new.md")).toBeDefined();
        expect(host.settings.timeline.snapshots["new.md"]).toHaveLength(1);

        fire("rename", file("moved.md"), "new.md");
        expect(index.model.get("moved.md")).toBeDefined();
        expect(index.model.get("new.md")).toBeUndefined();

        fire("delete", file("moved.md"));
        expect(index.model.get("moved.md")).toBeUndefined();
    });

    it("enabled at runtime, with the layout already ready, it builds and listens at once (AC-5)", () => {
        const { plugin, vault, fire } = wire([file("a.md")], true);
        const index = KnowledgeIndex.getInstance();
        index.bootstrap(plugin as never);

        expect(index.status).toBe("ready");
        expect(vault.on).toHaveBeenCalled();
        fire("create", file("later.md"));
        expect(index.model.get("later.md")).toBeDefined();
    });
});

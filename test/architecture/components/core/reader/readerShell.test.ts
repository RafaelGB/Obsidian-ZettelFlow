import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { MarkdownRenderer, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { ReaderView, readableBody } from "architecture/components/core/reader/ReaderView";
import { parseReaderState, READER_VIEW } from "architecture/components/core/reader/readerContract";
import { normalizeReaderPrefs, readerClassNames, DEFAULT_READER_PREFS } from "architecture/components/core/reader/readerPrefs";
import { collapseSides, restoreSides, snapshotSides, type SideLike } from "architecture/components/core/reader/readerWorkspace";
import { openReader, restoreWorkspace, resetReaderWorkspace } from "architecture/components/core/reader/openReader";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");

function side(collapsed: boolean): SideLike & { calls: string[] } {
    const s = {
        collapsed,
        calls: [] as string[],
        collapse() {
            s.collapsed = true;
            s.calls.push("collapse");
        },
        expand() {
            s.collapsed = false;
            s.calls.push("expand");
        },
    };
    return s;
}

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

describe("the reader's contract and type (#668)", () => {
    it("is the zettelflow-reader view and parses only what it knows", () => {
        expect(READER_VIEW).toBe("zettelflow-reader");
        expect(parseReaderState({ seed: "a.md", chapter: 2, restore: { left: false, right: true } })).toEqual({
            seed: "a.md",
            chapter: 2,
            restore: { left: false, right: true },
        });
        expect(parseReaderState({ seed: 3, chapter: -1 })).toEqual({});
        expect(parseReaderState(null)).toEqual({});
    });

    it("falls back to the theme's own type for anything unknown", () => {
        expect(normalizeReaderPrefs({ font: "comic", size: "large" })).toEqual({ ...DEFAULT_READER_PREFS, size: "large" });
    });

    it("wears Obsidian's own palettes for light, sepia and dark, and nothing for your theme", () => {
        expect(readerClassNames({ font: "serif", size: "small", theme: "sepia" })).toEqual({
            plugin: ["reader", "reader--font-serif", "reader--size-small", "reader--theme-sepia"],
            obsidian: ["theme-light"],
        });
        expect(readerClassNames({ ...DEFAULT_READER_PREFS, theme: "dark" }).obsidian).toEqual(["theme-dark"]);
        expect(readerClassNames(DEFAULT_READER_PREFS).obsidian).toEqual([]);
    });

    it("reads a note without its properties", () => {
        expect(readableBody("---\nstate: fleeting\n---\n# Title\nBody")).toBe("# Title\nBody");
        expect(readableBody("No frontmatter")).toBe("No frontmatter");
    });
});

describe("taking the window and giving it back (#668 R3)", () => {
    it("folds the open sidebars and restores exactly what was there", () => {
        const left = side(false);
        const right = side(true);
        const snap = snapshotSides(left, right);
        collapseSides(left, right);
        expect([left.collapsed, right.collapsed]).toEqual([true, true]);
        restoreSides(snap, left, right);
        expect([left.collapsed, right.collapsed]).toEqual([false, true]);
        expect(right.calls).toEqual([]); // a sidebar that was folded is never touched
    });
});

function workspace(existing: WorkspaceLeaf[] = []) {
    const left = side(false);
    const right = side(false);
    const previous = { id: "editor" } as unknown as WorkspaceLeaf;
    const fresh = { setViewState: jest.fn(async () => undefined) } as unknown as WorkspaceLeaf;
    const ws = {
        leftSplit: left,
        rightSplit: right,
        getMostRecentLeaf: () => previous,
        getLeavesOfType: jest.fn(() => existing),
        getLeaf: jest.fn(() => fresh),
        revealLeaf: jest.fn(async () => undefined),
        iterateAllLeaves: (fn: (leaf: WorkspaceLeaf) => void) => fn(previous),
        setActiveLeaf: jest.fn(),
    };
    return { ws, left, right, previous, fresh };
}

describe("openReader (#668)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        (Platform as { isMobile: boolean }).isMobile = false;
    });

    it("folds both sidebars, opens the reader in a tab and gives everything back on exit", async () => {
        const { ws, left, right, previous, fresh } = workspace();
        await openReader({ workspace: ws } as never, "a.md");
        expect([left.collapsed, right.collapsed]).toEqual([true, true]);
        expect(fresh.setViewState).toHaveBeenCalledWith({ type: "zettelflow-reader", state: { seed: "a.md", chapter: 0 }, active: true });
        restoreWorkspace({ workspace: ws } as never);
        expect([left.collapsed, right.collapsed]).toEqual([false, false]);
        expect(ws.setActiveLeaf).toHaveBeenCalledWith(previous, { focus: true });
        // Idempotent: a second restore does nothing.
        left.collapse();
        restoreWorkspace({ workspace: ws } as never);
        expect(left.collapsed).toBe(true);
    });

    it("keeps the first snapshot when you read from another note without leaving", async () => {
        const reader = { setViewState: jest.fn(async () => undefined) } as unknown as WorkspaceLeaf;
        const { ws, left } = workspace([reader]);
        await openReader({ workspace: ws } as never, "a.md");
        await openReader({ workspace: ws } as never, "b.md");
        expect(ws.getLeaf).not.toHaveBeenCalled();
        restoreWorkspace({ workspace: ws } as never);
        expect(left.collapsed).toBe(false);
    });

    it("never moves the drawers on mobile", async () => {
        (Platform as { isMobile: boolean }).isMobile = true;
        const { ws, left, right } = workspace();
        await openReader({ workspace: ws } as never, "a.md");
        expect([left.calls, right.calls]).toEqual([[], []]);
    });
});

function mountReader(prefs?: unknown) {
    const files: Record<string, string> = {
        "a.md": "---\nstate: fleeting\n---\nThe body of A.",
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
            modify: jest.fn(),
            process: jest.fn(),
        },
        metadataCache: { getFirstLinkpathDest: () => null },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const plugin = { settings: { readerPrefs: prefs }, saveSettings: jest.fn(async () => undefined) };
    const view = new ReaderView(leaf, plugin);
    return { view, app, content, leaf, plugin };
}

describe("the reader view (#668)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
    });

    it("returns its type as a literal (#278)", () => {
        const src = readFileSync(join(ROOT, "src/architecture/components/core/reader/ReaderView.ts"), "utf8");
        expect(src).toMatch(/getViewType\(\)\s*:\s*string\s*\{\s*return\s*"zettelflow-reader"/);
    });

    it("renders the chapter with Obsidian's renderer, without its properties, under its counter and role", async () => {
        const { view, content } = mountReader();
        await view.setState({ seed: "a.md" }, {} as never);
        await view.onOpen();
        await flush();
        // The raw note goes to the renderer, which hides the properties itself (as Obsidian does).
        expect(MarkdownRenderer.calls.at(-1)).toEqual({ markdown: "---\nstate: fleeting\n---\nThe body of A.", sourcePath: "a.md" });
        expect(content.oneByClass("reader-body").textContent).not.toContain("fleeting");
        expect(content.oneByClass("reader-count").textContent).toBe("01 / 01");
        expect(content.oneByClass("reader-chapter-title").textContent).toBe("a");
        expect(content.byClass("reader-role-tag")[0].textContent).toBe("Context");
    });

    it("remembers where you are in the view state", async () => {
        const { view } = mountReader();
        await view.setState({ seed: "a.md", chapter: 0, restore: { left: false, right: true } }, {} as never);
        expect(view.getState()).toMatchObject({ seed: "a.md", chapter: 0, restore: { left: false, right: true } });
    });

    it("leaves with Esc: the leaf closes", async () => {
        const { view, content, leaf } = mountReader();
        await view.setState({ seed: "a.md" }, {} as never);
        await view.onOpen();
        content.fire("keydown", { key: "Escape", target: content });
        expect(leaf.detach).toHaveBeenCalled();
    });

    it("saves the type you pick and wears it at once", async () => {
        const { view, content, plugin } = mountReader();
        await view.setState({ seed: "a.md" }, {} as never);
        await view.onOpen();
        const typeButton = content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!;
        typeButton.click();
        const sepia = content.byClass("reader-type-option").find((b) => b.textContent === "Sepia")!;
        sepia.click();
        expect(plugin.settings.readerPrefs).toEqual({ font: "sans", size: "medium", theme: "sepia" });
        const root = content.children[0];
        expect(root.hasClass("theme-light")).toBe(true);
        expect(root.hasClass("zettelkasten-flow__reader--theme-sepia")).toBe(true);
        expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it("never writes the note it reads", async () => {
        const { view, app } = mountReader();
        await view.setState({ seed: "a.md" }, {} as never);
        await view.onOpen();
        await flush();
        expect(app.vault.modify).not.toHaveBeenCalled();
        expect(app.vault.process).not.toHaveBeenCalled();
    });
});

describe("the reader writes no note (#667 R2)", () => {
    function sources(dir: string): string[] {
        return readdirSync(dir).flatMap((entry) => {
            const full = join(dir, entry);
            return statSync(full).isDirectory() ? sources(full) : [full];
        });
    }

    it("reaches no writer anywhere under its module, but the export you press (#672)", () => {
        const dir = join(ROOT, "src/architecture/components/core/reader");
        const exporter = join(dir, "readerExport.ts");
        for (const f of sources(dir)) {
            if (f === exporter) continue;
            const src = readFileSync(f, "utf8");
            for (const writer of ["FileService", "FrontmatterService", ".modify(", ".process(", ".create(", "processFrontMatter", ".append("]) {
                expect({ file: f.replace(dir, "reader"), writer, found: src.includes(writer) }).toEqual({
                    file: f.replace(dir, "reader"),
                    writer,
                    found: false,
                });
            }
        }
    });

    it("exports create-only, through FileService, in a recorded batch (#672)", () => {
        const src = readFileSync(join(ROOT, "src/architecture/components/core/reader/readerExport.ts"), "utf8");
        expect(src).toContain("FileService.createFile(");
        expect(src).toContain("withWriteBatch(");
        expect(src).toContain("freeExportPath(");
        for (const writer of ["FrontmatterService", ".modify(", ".process(", "processFrontMatter", ".append(", "vault.create("]) {
            expect({ writer, found: src.includes(writer) }).toEqual({ writer, found: false });
        }
    });

    it("writes highlights only as thoughts, through the thought store (#671)", () => {
        const dir = join(ROOT, "src/architecture/components/core/reader");
        const writers = sources(dir).filter((f) => /\bstore\.(write|save|discard|restore)\(/.test(readFileSync(f, "utf8")));
        expect(writers.map((f) => f.replace(dir, "reader").replace(/\\/g, "/"))).toEqual(["reader/readerHighlights.ts"]);
        expect(readFileSync(join(dir, "readerHighlights.ts"), "utf8")).toContain('from "architecture/plugin/thinking/ThoughtStore"');
    });
});

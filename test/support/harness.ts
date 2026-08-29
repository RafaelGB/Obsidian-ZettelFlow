import { TFile, stringifyYaml } from "obsidian";
import { __setMockObsidianApi } from "architecture";

/**
 * Shared write-path test harness (#317 E2, S1). Gives every behavioral test an in-memory vault whose
 * `FileService` / `FrontmatterService` calls actually round-trip, so a test of any vault-mutating path
 * costs a few lines. One `frontmatter` object per file is shared between `metadataCache.getFileCache`
 * and `fileManager.processFrontMatter`, so a write is visible to a later read (as in real Obsidian).
 */

export interface FileSpec {
    frontmatter?: Record<string, unknown>;
    body?: string;
}

interface Entry {
    file: TFile;
    frontmatter: Record<string, unknown>;
    content: string;
}

function makeTFile(path: string): TFile {
    const file = new TFile();
    file.path = path;
    file.name = path.split("/").pop() ?? path;
    file.basename = file.name.replace(/\.md$/i, "");
    file.extension = "md";
    return file;
}

function render(frontmatter: Record<string, unknown>, body: string): string {
    if (Object.keys(frontmatter).length === 0) return body;
    return `---\n${stringifyYaml(frontmatter)}---\n${body}`;
}

export class FakeVault {
    readonly entries = new Map<string, Entry>();
    readonly adapter = { exists: async (path: string) => this.entries.has(path) };

    add(path: string, spec: FileSpec = {}): TFile {
        const frontmatter = { ...(spec.frontmatter ?? {}) };
        const file = makeTFile(path);
        this.entries.set(path, { file, frontmatter, content: render(frontmatter, spec.body ?? "") });
        return file;
    }

    // ── Vault API surface used by FileService / FrontmatterService / KnowledgeIndex ──
    getMarkdownFiles(): TFile[] {
        return [...this.entries.values()].map((e) => e.file);
    }
    getAbstractFileByPath(path: string): TFile | null {
        return this.entries.get(path)?.file ?? null;
    }
    getFileByPath(path: string): TFile | null {
        return this.entries.get(path)?.file ?? null;
    }
    async cachedRead(file: TFile): Promise<string> {
        return this.entries.get(file.path)?.content ?? "";
    }
    async read(file: TFile): Promise<string> {
        return this.cachedRead(file);
    }
    async modify(file: TFile, content: string): Promise<void> {
        const e = this.entries.get(file.path);
        if (e) e.content = content;
    }
    async create(path: string, content: string): Promise<TFile> {
        const file = makeTFile(path);
        this.entries.set(path, { file, frontmatter: {}, content });
        return file;
    }
    async createFolder(_path: string): Promise<void> {
        /* no-op: folders are implicit in the flat map */
    }
    on(): { unload: () => void } {
        return { unload: () => undefined };
    }

    // ── test assertions ──
    contentOf(path: string): string {
        return this.entries.get(path)?.content ?? "";
    }
    frontmatterOf(path: string): Record<string, unknown> {
        return this.entries.get(path)?.frontmatter ?? {};
    }
}

export interface Harness {
    vault: FakeVault;
    app: { vault: FakeVault; metadataCache: unknown; fileManager: unknown; workspace: unknown };
    plugin: { app: unknown; settings: Record<string, unknown>; saveSettings: () => Promise<void>; manifest: { version: string } };
    settings: Record<string, unknown>;
}

/** Wire an in-memory Obsidian for the current test. Returns handles for arranging + asserting. */
export function wireHarness(opts: { files?: Record<string, FileSpec>; settings?: Record<string, unknown> } = {}): Harness {
    const vault = new FakeVault();
    for (const [path, spec] of Object.entries(opts.files ?? {})) vault.add(path, spec);

    const fileManager = {
        processFrontMatter: async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
            const e = vault.entries.get(file.path);
            if (e) fn(e.frontmatter);
        },
        trashFile: async (file: TFile) => {
            vault.entries.delete(file.path);
        },
    };
    const metadataCache = {
        getFileCache: (file: TFile) => ({ frontmatter: vault.entries.get(file.path)?.frontmatter ?? {} }),
        resolvedLinks: {},
        getFirstLinkpathDest: () => null,
        on: () => ({ unload: () => undefined }),
    };
    const workspace = {
        openLinkText: async () => undefined,
        getActiveFile: () => null,
        on: () => ({ unload: () => undefined }),
    };

    const settings = opts.settings ?? {};
    const app = { vault, metadataCache, fileManager, workspace };
    const plugin = {
        app,
        settings,
        saveSettings: async () => undefined,
        manifest: { version: "9.9.9" },
        registerEvent: () => undefined,
        register: () => undefined,
    };

    __setMockObsidianApi({
        vault: vault as never,
        metadataCache: metadataCache as never,
        fileManager: fileManager as never,
        ownPlugin: plugin as never,
    });

    return { vault, app: app as never, plugin: plugin as never, settings };
}

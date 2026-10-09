/* eslint-disable @typescript-eslint/no-explicit-any */
import { TFile, TFolder } from "obsidian";
import YAML from "yaml";
import { __setMockObsidianApi } from "architecture";

/**
 * A vault of Markdown notes in memory (#743): `create`, folders, and a `processFrontMatter` that does
 * what Obsidian's does — parse the YAML block, hand it over, write it back re-serialised, the body
 * untouched — so a test can say what a frontmatter write changed and what it left alone.
 */
export interface FakeNoteVault {
    contents: Map<string, string>;
    folders: Set<string>;
    file(path: string): TFile | null;
    put(path: string, content: string): TFile;
    frontmatter(path: string): Record<string, unknown>;
    body(path: string): string;
    vault: Record<string, any>;
    metadataCache: Record<string, any>;
    fileManager: Record<string, any>;
    calls: { create: string[]; createFolder: string[]; process: string[]; trash: string[] };
}

function split(content: string): { yaml: string; body: string } {
    if (!content.startsWith("---\n")) return { yaml: "", body: content };
    const end = content.indexOf("\n---", 4);
    if (end < 0) return { yaml: "", body: content };
    const after = content.indexOf("\n", end + 4);
    return { yaml: content.slice(4, end + 1), body: after < 0 ? "" : content.slice(after + 1) };
}

export function fakeNoteVault(): FakeNoteVault {
    const contents = new Map<string, string>();
    const files = new Map<string, TFile>();
    const folders = new Set<string>();
    const calls = { create: [] as string[], createFolder: [] as string[], process: [] as string[], trash: [] as string[] };
    const make = (path: string): TFile => {
        const f = files.get(path) ?? new TFile();
        f.path = path;
        f.name = path.split("/").pop() ?? path;
        f.basename = f.name.replace(/\.md$/, "");
        f.extension = path.split(".").pop() ?? "";
        (f as any).stat = { size: 1, ctime: Date.now(), mtime: Date.now() };
        files.set(path, f);
        return f;
    };
    const frontmatter = (path: string) => (YAML.parse(split(contents.get(path) ?? "").yaml) ?? {}) as Record<string, unknown>;
    const folderOf = (path: string) => {
        const folder = new TFolder();
        (folder as any).path = path;
        return folder;
    };
    const vault = {
        getAbstractFileByPath: (path: string) => (contents.has(path) ? files.get(path) : folders.has(path) ? folderOf(path) : null),
        getFileByPath: (path: string) => (contents.has(path) ? files.get(path) : null),
        getFolderByPath: (path: string) => (folders.has(path) ? folderOf(path) : null),
        getMarkdownFiles: () => [...contents.keys()].filter((p) => p.endsWith(".md")).map((p) => files.get(p)),
        adapter: { exists: async (path: string) => path === "" || folders.has(path) || contents.has(path) },
        createFolder: async (path: string) => {
            calls.createFolder.push(path);
            const parts = path.split("/");
            for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
        },
        create: async (path: string, content: string) => {
            if (contents.has(path)) throw new Error("File already exists.");
            calls.create.push(path);
            contents.set(path, content);
            return make(path);
        },
        cachedRead: async (file: TFile) => contents.get(file.path) ?? "",
        read: async (file: TFile) => contents.get(file.path) ?? "",
        on: () => ({}),
    };
    const fileManager = {
        processFrontMatter: async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
            calls.process.push(file.path);
            const { yaml, body } = split(contents.get(file.path) ?? "");
            const fm = (YAML.parse(yaml) ?? {}) as Record<string, unknown>;
            fn(fm);
            contents.set(file.path, `---\n${YAML.stringify(fm)}---\n${body}`);
            make(file.path);
        },
        trashFile: async (file: TFile) => {
            calls.trash.push(file.path);
            contents.delete(file.path);
        },
    };
    const metadataCache = {
        getFileCache: (file: TFile) => (contents.has(file.path) ? { frontmatter: frontmatter(file.path) } : null),
        getFirstLinkpathDest: (link: string) => files.get(link) ?? null,
        on: () => ({}),
    };
    __setMockObsidianApi({ vault, metadataCache, fileManager });
    return {
        contents,
        folders,
        file: (path) => (contents.has(path) ? files.get(path)! : null),
        put: (path, content) => {
            contents.set(path, content);
            return make(path);
        },
        frontmatter,
        body: (path) => split(contents.get(path) ?? "").body,
        vault,
        metadataCache,
        fileManager,
        calls,
    };
}

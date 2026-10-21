import { articlesFolder, inFolder } from "./article";
import { bookLink, linkTarget } from "./bookNote";
import { matchesSearch, type ShelfItem } from "./shelf";

/**
 * **The Library's archive** (#865) — pure.
 *
 * A filing cabinet at the end of the stacks: a book, paper or article you put away is **moved** into
 * its own folder — never changed — and from then on it is on no shelf, in no count and out of the
 * search, until you take it back. Everything here is a reading of paths and one small map of where
 * each thing came from; nothing reads a file.
 */

/** The archive's folder until you choose another: on for everyone (owner, 2026-10-21). */
export const ARCHIVE_DEFAULT = "Library archive";

/** The folder as the setting holds it: the default when never set, `""` (off) when emptied. */
export function archiveFolderOf(raw: unknown): string {
    return raw === undefined ? ARCHIVE_DEFAULT : articlesFolder(raw);
}

/** The Library's folders, each of which must be its own (FR-3, FR-4). */
export type LibraryFolder = "bookNotes" | "articles" | "dictionaries" | "archive";
export const LIBRARY_FOLDERS: readonly LibraryFolder[] = ["bookNotes", "articles", "dictionaries", "archive"];

/** How a folder collides with another: it *is* it, sits *inside* it, or *holds* it. */
export interface FolderClash {
    with: LibraryFolder;
    how: "is" | "inside" | "holds";
}

const folderKey = (value: string): string => articlesFolder(value).toLowerCase();

/**
 * Whether `candidate` collides with one of the `others` (FR-3, FR-4): the same folder, one inside
 * the other, either way. Slash-bounded — `Library archive` is not inside `Library` — and case-folded,
 * as the file systems that keep a vault on Windows and macOS are. An empty folder collides with none.
 */
export function folderClash(candidate: string, others: Partial<Record<LibraryFolder, string>>): FolderClash | null {
    const mine = folderKey(candidate);
    if (!mine) return null;
    for (const role of LIBRARY_FOLDERS) {
        const other = folderKey(others[role] ?? "");
        if (!other) continue;
        if (mine === other) return { with: role, how: "is" };
        if (mine.startsWith(`${other}/`)) return { with: role, how: "inside" };
        if (other.startsWith(`${mine}/`)) return { with: role, how: "holds" };
    }
    return null;
}

/** Whether a vault path lies in the archive (FR-12): however it got there. */
export function isArchived(path: string | undefined, archive: string): boolean {
    return !!path && inFolder(path, archive);
}

/** Whether an item can be archived (FR-7): a book, a paper or an article — never a saved path. */
export function archivable(item: Pick<ShelfItem, "kind" | "file">): boolean {
    return item.kind !== "path" && !!item.file;
}

/** The shelf and the cabinet (FR-13): what lies in the archive folder is in the cabinet, by path alone. */
export function splitArchived<T extends Pick<ShelfItem, "file">>(items: readonly T[], archive: string): { shelf: T[]; archived: T[] } {
    const shelf: T[] = [];
    const archived: T[] = [];
    for (const item of items) (isArchived(item.file, archive) ? archived : shelf).push(item);
    return { shelf, archived };
}

/** A drawer of the cabinet. */
export type Drawer = "books" | "papers" | "articles";
export const DRAWERS: readonly Drawer[] = ["books", "papers", "articles"];

export function drawerOf(item: Pick<ShelfItem, "kind">): Drawer | null {
    return item.kind === "book" ? "books" : item.kind === "paper" ? "papers" : item.kind === "article" ? "articles" : null;
}

/** How many each drawer holds (FR-15). */
export function drawerCounts(archived: readonly Pick<ShelfItem, "kind">[]): Record<Drawer, number> {
    const counts: Record<Drawer, number> = { books: 0, papers: 0, articles: 0 };
    for (const item of archived) {
        const drawer = drawerOf(item);
        if (drawer) counts[drawer]++;
    }
    return counts;
}

/** What the Library's search finds in the cabinet (FR-14): how many, and the drawer of the first. */
export function archivedMatches(archived: readonly ShelfItem[], search: string): { count: number; first: Drawer | null } {
    if (!search.trim()) return { count: 0, first: null };
    const found = archived.filter((item) => matchesSearch(item, search));
    const first = DRAWERS.find((drawer) => found.some((item) => drawerOf(item) === drawer)) ?? null;
    return { count: found.length, first };
}

/** Where an archived thing came from, and when it was put away (FR-10). */
export interface ArchiveRecord {
    from: string;
    at: number;
}
export type ArchiveRecords = Record<string, ArchiveRecord>;

/** The saved map, forgiving: anything that is not a path and a time is left out. */
export function normalizeArchiveRecords(raw: unknown): ArchiveRecords {
    const out: ArchiveRecords = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
        const record = value as Partial<ArchiveRecord> | null;
        if (typeof record?.from === "string" && record.from && typeof record.at === "number" && Number.isFinite(record.at)) out[path] = { from: record.from, at: record.at };
    }
    return out;
}

/** One drawer's cards (FR-19): its kind, narrowed by its own search, the last put away first. */
export function drawerCards(archived: readonly ShelfItem[], drawer: Drawer, search: string, records: ArchiveRecords): ShelfItem[] {
    const at = (item: ShelfItem) => (item.file ? (records[item.file]?.at ?? 0) : 0);
    return archived
        .filter((item) => drawerOf(item) === drawer && matchesSearch(item, search))
        .sort((a, b) => at(b) - at(a) || a.title.localeCompare(b.title));
}

const dirOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The folder a path is in, for a card's *Was in …/*; `""` is the vault root. */
export function folderOf(path: string): string {
    return dirOf(path);
}

/**
 * The first free path for `fileName` in `folder` (FR-9): the name itself, else `name 2.ext`,
 * `name 3.ext`… A move never overwrites.
 */
export function freePath(folder: string, fileName: string, exists: (path: string) => boolean): string {
    const dir = articlesFolder(folder);
    const join = (file: string) => (dir ? `${dir}/${file}` : file);
    const dot = fileName.lastIndexOf(".");
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : "";
    let candidate = join(fileName);
    for (let n = 2; exists(candidate) && n < 1000; n++) candidate = join(`${stem} ${n}${ext}`);
    return candidate;
}

/** Where archiving puts a file (FR-8, FR-9). */
export function archiveTarget(path: string, archive: string, exists: (path: string) => boolean): string {
    return freePath(archive, nameOf(path), exists);
}

export interface ReturnContext {
    /** The articles folder; `""` when articles are off. */
    articles: string;
    folderExists: (folder: string) => boolean;
    exists: (path: string) => boolean;
}

/**
 * Where *Return to shelf* puts a file (FR-20): where it came from; the vault root when that folder is
 * gone or nothing is known. An article goes back inside the articles folder — to where it was when
 * that is still inside it, else to the folder itself — so it is an article on the shelf again; with
 * articles off it cannot go back (`null`).
 */
export function returnTarget(path: string, kind: ShelfItem["kind"], record: ArchiveRecord | undefined, context: ReturnContext): string | null {
    const name = record ? nameOf(record.from) : nameOf(path);
    if (kind === "article") {
        const articles = articlesFolder(context.articles);
        if (!articles) return null;
        const from = record ? dirOf(record.from) : "";
        const inside = from === articles || from.startsWith(`${articles}/`);
        const folder = inside && context.folderExists(from) ? from : articles;
        return freePath(folder, name, context.exists);
    }
    const from = record ? dirOf(record.from) : "";
    const folder = from && context.folderExists(from) ? from : "";
    return freePath(folder, name, context.exists);
}

/**
 * The `book` value a book note needs after its book moved to `to` (FR-24), or `null` when the link
 * still finds it — whether Obsidian updated it or not, which is never asked.
 */
export function relinkBook(value: unknown, to: string, resolve: (link: string) => string | null): string | null {
    const link = linkTarget(value);
    if (link && resolve(link) === to) return null;
    return bookLink(to);
}

/**
 * The records after `from` → `to` (FR-10): re-keyed while it stays in the archive, forgotten when it
 * leaves. The same map when nothing changes.
 */
export function followArchiveRecord(records: ArchiveRecords, from: string, to: string, archive: string): ArchiveRecords {
    const record = records[from];
    if (!record) return records;
    const next: ArchiveRecords = {};
    for (const [key, value] of Object.entries(records)) if (key !== from) next[key] = value;
    if (isArchived(to, archive)) next[to] = record;
    return next;
}

/** What *Leave them* would leave (FR-5): books and papers, and articles, counted apart. */
export function leaveOffer(archived: readonly Pick<ShelfItem, "kind">[]): { sources: number; articles: number } {
    let sources = 0;
    let articles = 0;
    for (const item of archived) {
        if (item.kind === "article") articles++;
        else if (item.kind === "book" || item.kind === "paper") sources++;
    }
    return { sources, articles };
}

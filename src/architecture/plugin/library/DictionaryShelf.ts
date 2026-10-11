import { Platform, type TFile } from "obsidian";
import { log } from "architecture";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { inflateRaw, type Inflate } from "application/library/zip";
import {
    buildLookup,
    dictionaryLanguages,
    idxWord,
    inflateWhole,
    parseIdx,
    parseIfo,
    parseSyn,
    readDictzipHeader,
    readDictzipRange,
    type DictionaryLanguages,
    type DictzipHeader,
    type IdxTable,
    type LookupDictionary,
    type StardictIfo,
    type StardictReason,
    type SynonymIndex,
} from "application/library/stardict";
import { DEVICE_LIMITS, tooLarge as deviceTooLarge } from "architecture/components/core/reader/readerDevice";

/**
 * **Your dictionaries, found and opened** (#766 FR-2, FR-3, FR-4, FR-8, epic #741).
 *
 * - **Found by name** (`list`): the vault's file list, filtered to the folder you chose and grouped by
 *   name — `.ifo`, `.idx`, `.dict` or `.dict.dz`, `.syn`, loose or in a folder of their own. No file
 *   is read to list them; Settings reads the small `.ifo` to name each one (`info`).
 * - **Opened on the first look-up that needs one** (`open`), never when the plugin loads or a book
 *   opens: the vault's binary read (never the Adapter API), parsed on the device, kept for the session
 *   in a cache capped by size. A mobile device refuses one past its limit before reading it.
 * - **Never written.** This class has no method that writes, moves or downloads anything: there is
 *   nothing here to call.
 */

/** The files of one dictionary, by the name they share. */
export interface DictionaryFiles {
    /** The shared path without its extension: `Dictionaries/es/wiktionary-es`. */
    base: string;
    ifo?: TFile;
    idx?: TFile;
    dict?: TFile;
    /** Whether `dict` is a `.dict.dz`. */
    dz: boolean;
    /** Whether `idx` is an `.idx.gz` — as FreeDict ships its StarDict builds. */
    idxGz?: boolean;
    syn?: TFile;
    /** The first file it lacks, when it lacks one: then it is listed, and never used. */
    missing?: ".ifo" | ".idx" | ".dict";
}

/** What Settings shows of a dictionary: its name and languages, or why it is not used. */
export interface DictionaryInfo {
    files: DictionaryFiles;
    name: string;
    ifo: StardictIfo | null;
    languages: DictionaryLanguages | null;
    reason?: StardictReason;
}

/** A dictionary opened for look-up: its table, and its entries read on demand. */
export interface OpenedDictionary extends LookupDictionary {
    base: string;
    sametypesequence?: string;
    /** The headword of a record of the index. */
    headword(record: number): string;
    /** The bytes of a record's entry, or `null` when they cannot be read. */
    entry(record: number): Promise<Uint8Array | null>;
}

export type OpenResult = { ok: true; dictionary: OpenedDictionary } | { ok: false; reason: StardictReason };

/** The vault, as far as the shelf reads it: its file list and its binary read. Nothing that writes. */
export interface ShelfVault {
    getFiles(): TFile[];
    readBinary(file: TFile): Promise<ArrayBuffer>;
}

export interface ShelfDeps {
    inflate?: Inflate;
    /** Whether this device should not open a dictionary of `size` bytes (#750's limits). */
    tooLarge?: (size: number) => boolean;
    /** The session cache's ceiling, in bytes. */
    cacheBytes?: number;
}

const DEFAULT_CACHE_BYTES = 256 * 1024 * 1024;

/** `name.dict.dz` before `name.dict`, `name.idx.gz` before `name.idx`: the longest extension wins. */
const SUFFIXES: readonly [string, keyof Pick<DictionaryFiles, "ifo" | "idx" | "dict" | "syn">, boolean][] = [
    [".dict.dz", "dict", true],
    [".dict", "dict", false],
    [".ifo", "ifo", false],
    [".idx.gz", "idx", true],
    [".idx", "idx", false],
    [".syn", "syn", false],
];

interface Cached {
    key: string;
    dictionary: OpenedDictionary;
    bytes: number;
}

function inFolder(path: string, folder: string): boolean {
    return folder === "" || path.startsWith(`${folder}/`);
}

function filesOf(set: DictionaryFiles): TFile[] {
    return [set.ifo, set.idx, set.dict, set.syn].filter((file): file is TFile => Boolean(file));
}

/** A dictionary changed on disk (it synced again) is opened again. */
function versionOf(set: DictionaryFiles): string {
    return filesOf(set)
        .map((file) => `${file.path}:${file.stat?.mtime ?? 0}:${file.stat?.size ?? 0}`)
        .join("|");
}

export class DictionaryShelf {
    private static instance: DictionaryShelf | null = null;

    static getInstance(): DictionaryShelf {
        DictionaryShelf.instance ??= new DictionaryShelf(() => ObsidianApi.vault());
        return DictionaryShelf.instance;
    }

    private readonly inflate: Inflate;
    private readonly refuse: (size: number) => boolean;
    private readonly cacheBytes: number;
    /** Opened this session, oldest first (a `Map` keeps its order: a use moves one to the end). */
    private readonly opened = new Map<string, Cached>();
    private readonly opening = new Map<string, Promise<OpenResult>>();
    private readonly infos = new Map<string, { version: string; info: DictionaryInfo }>();
    /** Bumped by `forget()`: an opening that began before it is never kept. */
    private generation = 0;

    constructor(
        private readonly vault: () => ShelfVault,
        deps: ShelfDeps = {}
    ) {
        this.inflate = deps.inflate ?? inflateRaw;
        this.refuse = deps.tooLarge ?? ((size) => deviceTooLarge(size, "stardict"));
        // A mobile device holds no more for the session than it lets one dictionary be (#750).
        this.cacheBytes = deps.cacheBytes ?? (Platform.isMobile ? DEVICE_LIMITS.stardict : DEFAULT_CACHE_BYTES);
    }

    /** The dictionaries in `folder`, by their names — no file is read (FR-2). */
    list(folder: string): DictionaryFiles[] {
        const root = folder.trim().replace(/^\/+|\/+$/g, "");
        const sets = new Map<string, DictionaryFiles>();
        for (const file of this.vault().getFiles()) {
            if (!inFolder(file.path, root)) continue;
            const lower = file.path.toLowerCase();
            const suffix = SUFFIXES.find(([ext]) => lower.endsWith(ext));
            if (!suffix) continue;
            const [ext, slot, zipped] = suffix;
            const base = file.path.slice(0, file.path.length - ext.length);
            const set = sets.get(base) ?? { base, dz: false };
            // A compressed file beside a plain one of the same name: the plain one is read, it costs nothing to inflate.
            if (slot === "dict" && set.dict && !set.dz) continue;
            if (slot === "idx" && set.idx && !set.idxGz) continue;
            set[slot] = file;
            if (slot === "dict") set.dz = zipped;
            if (slot === "idx") set.idxGz = zipped;
            sets.set(base, set);
        }
        const out: DictionaryFiles[] = [];
        for (const set of sets.values()) {
            // A stray `.idx` or `.syn` with no `.ifo` is not a dictionary at all.
            if (!set.ifo && !set.dict) continue;
            const missing = !set.ifo ? ".ifo" : !set.idx ? ".idx" : !set.dict ? ".dict" : undefined;
            out.push(missing ? { ...set, missing } : set);
        }
        return out.sort((a, b) => a.base.localeCompare(b.base));
    }

    /** A dictionary's name and languages, from its `.ifo` — the one small read Settings makes. */
    async info(set: DictionaryFiles, saved?: { from?: string; to?: string }): Promise<DictionaryInfo> {
        const fallback = set.base.split("/").pop() ?? set.base;
        const version = versionOf(set);
        const held = this.infos.get(set.base);
        const withSaved = (info: DictionaryInfo): DictionaryInfo => ({ ...info, languages: dictionaryLanguages(info.ifo, saved) });
        if (held && held.version === version) return withSaved(held.info);
        let info: DictionaryInfo = { files: set, name: fallback, ifo: null, languages: null };
        if (set.ifo) {
            const ifo = await this.readIfo(set.ifo);
            info = ifo.ok ? { files: set, name: ifo.value.bookname, ifo: ifo.value, languages: null } : { ...info, reason: ifo.reason };
        }
        this.infos.set(set.base, { version, info });
        return withSaved(info);
    }

    /** Whether `set` is open now: its look-up answers at once (FR-13). */
    isOpen(set: DictionaryFiles): boolean {
        return this.opened.get(set.base)?.key === versionOf(set);
    }

    /**
     * Open `set` for look-up, once per session (FR-4): its `.ifo`, `.idx`, `.syn` and `.dict` read
     * through the vault, its tables built. Refused, before any read, where the device is too small.
     */
    open(set: DictionaryFiles, languages: DictionaryLanguages | null): Promise<OpenResult> {
        const key = versionOf(set);
        const held = this.opened.get(set.base);
        if (held && held.key === key) {
            // Used now: the newest in the cache.
            this.opened.delete(set.base);
            this.opened.set(set.base, held);
            return Promise.resolve({ ok: true, dictionary: held.dictionary });
        }
        const pending = this.opening.get(key);
        if (pending) return pending;
        const run = this.read(set, languages).finally(() => this.opening.delete(key));
        this.opening.set(key, run);
        return run;
    }

    /** Let go of everything opened (the folder changed). */
    forget(): void {
        this.generation++;
        this.opened.clear();
        this.opening.clear();
        this.infos.clear();
    }

    private tooLargeHere(size: number): OpenResult {
        log.info(`[reader] a dictionary is too large to open on this device (${Math.round(size / 1024 / 1024)} MB)`);
        return { ok: false, reason: "too-large" };
    }

    private async readIfo(file: TFile): Promise<ReturnType<typeof parseIfo>> {
        try {
            return parseIfo(new TextDecoder("utf-8").decode(await this.vault().readBinary(file)));
        } catch (error) {
            log.warn(`[reader] a dictionary's .ifo could not be read: ${error instanceof Error ? error.name : "error"}`);
            return { ok: false, reason: "bad-ifo" };
        }
    }

    private async bytes(file: TFile): Promise<Uint8Array> {
        return new Uint8Array(await this.vault().readBinary(file));
    }

    /**
     * A turn of the event loop between the long steps of an opening: the card's *Opening …* can be
     * drawn, and the page answers a key, while a large dictionary is parsed (#766 FR-13, walk).
     */
    private breathe(): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    /** The index's bytes: an `.idx` as it is, an `.idx.gz` inflated once (its `idxfilesize` is the inflated one). */
    private async indexBytes(file: TFile, gz: boolean): Promise<Uint8Array | null> {
        const bytes = await this.bytes(file);
        if (!gz) return bytes;
        const header = readDictzipHeader(bytes);
        if (!header.ok) return null;
        const whole = await inflateWhole(bytes, header.value, this.inflate);
        return whole.ok ? whole.value : null;
    }

    private async read(set: DictionaryFiles, languages: DictionaryLanguages | null): Promise<OpenResult> {
        if (!set.ifo || !set.idx || !set.dict) return { ok: false, reason: !set.ifo ? "bad-ifo" : !set.idx ? "bad-idx" : "bad-dict" };
        const size = filesOf(set).reduce((sum, file) => sum + (file.stat?.size ?? 0), 0);
        // FR-8: what this device cannot hold is never read at all.
        if (this.refuse(size)) {
            log.info(`[reader] a dictionary is too large to open on this device (${Math.round(size / 1024 / 1024)} MB)`);
            return { ok: false, reason: "too-large" };
        }
        const generation = this.generation;
        try {
            const ifo = await this.readIfo(set.ifo);
            if (!ifo.ok) return ifo;
            // What it holds in memory, not on disk: a gzipped index is held inflated (the review of #766).
            let held = size + (set.idxGz ? ifo.value.idxfilesize - (set.idx.stat?.size ?? 0) : 0);
            if (this.refuse(held)) return this.tooLargeHere(held);
            const index = await this.indexBytes(set.idx, set.idxGz === true);
            if (!index) return { ok: false, reason: "bad-idx" };
            await this.breathe();
            const idx = parseIdx(index, ifo.value.idxoffsetbits, { count: ifo.value.wordcount, size: ifo.value.idxfilesize });
            if (!idx.ok) return idx;
            const from = languages?.from;
            await this.breathe();
            const headwords = buildLookup(idx.value, from);
            await this.breathe();
            let synonyms: SynonymIndex | undefined;
            if (set.syn) {
                const syn = parseSyn(await this.bytes(set.syn), idx.value.count, from);
                // A broken `.syn` costs the inflected forms, not the dictionary.
                if (syn.ok) synonyms = syn.value;
                else log.warn("[reader] a dictionary's .syn is unreadable; its headwords still answer");
            }
            await this.breathe();
            const dict = await this.bytes(set.dict);
            // A gzip with no chunk table is inflated whole: its inflated size (gzip's ISIZE) is what it holds.
            if (set.dz) {
                const head = readDictzipHeader(dict);
                if (head.ok && !head.value.chunks && dict.length >= 4) {
                    held += new DataView(dict.buffer, dict.byteOffset + dict.length - 4, 4).getUint32(0, true);
                    if (this.refuse(held)) return this.tooLargeHere(held);
                }
            }
            const entries = await this.entries(dict, set.dz, idx.value);
            if (!entries.ok) return entries;
            const dictionary: OpenedDictionary = {
                base: set.base,
                name: ifo.value.bookname,
                languages,
                headwords,
                ...(synonyms ? { synonyms } : {}),
                ...(ifo.value.sametypesequence ? { sametypesequence: ifo.value.sametypesequence } : {}),
                headword: (record) => (record >= 0 && record < idx.value.count ? idxWord(idx.value, record) : ""),
                entry: entries.value,
            };
            if (generation === this.generation) this.keep(set, { key: versionOf(set), dictionary, bytes: held + idx.value.count * 64 });
            return { ok: true, dictionary };
        } catch (error) {
            log.warn(`[reader] a dictionary could not be opened: ${error instanceof Error ? error.name : "error"}`);
            return { ok: false, reason: "bad-dict" };
        }
    }

    /** How a record's entry is read: a slice of a `.dict`, the chunks of a dictzip, or a gzip inflated once. */
    private async entries(dict: Uint8Array, dz: boolean, idx: IdxTable): Promise<{ ok: true; value: (record: number) => Promise<Uint8Array | null> } | { ok: false; reason: StardictReason }> {
        const range = (record: number) => (record >= 0 && record < idx.count ? { offset: idx.offset[record], size: idx.size[record] } : null);
        if (!dz) {
            return {
                ok: true,
                value: async (record) => {
                    const at = range(record);
                    if (!at || at.offset + at.size > dict.length) return null;
                    return dict.subarray(at.offset, at.offset + at.size);
                },
            };
        }
        const header = readDictzipHeader(dict);
        if (!header.ok) return header;
        const head: DictzipHeader = header.value;
        if (head.chunks) {
            return {
                ok: true,
                value: async (record) => {
                    const at = range(record);
                    if (!at) return null;
                    const read = await readDictzipRange(dict, head, at.offset, at.size, this.inflate);
                    return read.ok ? read.value : null;
                },
            };
        }
        // No chunk table: the one member, inflated once, now.
        const whole = await inflateWhole(dict, head, this.inflate);
        if (!whole.ok) return whole;
        const text = whole.value;
        return {
            ok: true,
            value: async (record) => {
                const at = range(record);
                if (!at || at.offset + at.size > text.length) return null;
                return text.subarray(at.offset, at.offset + at.size);
            },
        };
    }

    /** Into the session cache, the oldest let go past its ceiling — never the one just opened. */
    private keep(set: DictionaryFiles, cached: Cached): void {
        this.opened.delete(set.base);
        this.opened.set(set.base, cached);
        let total = [...this.opened.values()].reduce((sum, entry) => sum + entry.bytes, 0);
        for (const [base, entry] of this.opened) {
            if (total <= this.cacheBytes || base === set.base) break;
            this.opened.delete(base);
            total -= entry.bytes;
        }
    }
}

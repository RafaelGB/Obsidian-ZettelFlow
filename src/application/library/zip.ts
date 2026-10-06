/**
 * **A small unzip for EPUBs** (#680, #682, epic #675) — pure over bytes; the inflating is handed in.
 *
 * An EPUB is a ZIP of XHTML, images and a few XML files. L4 asked for "a small unzip (fflate-size)".
 * Smaller still is none at all: every platform Obsidian runs on inflates natively through
 * `DecompressionStream("deflate-raw")`, so what this module adds to the bundle is the part that
 * reads a ZIP's directory — about a hundred lines — and nothing that decompresses.
 *
 * Only what an EPUB needs: stored and deflated entries, read on demand, one at a time, so opening a
 * 5 MB book inflates its package and the chapter on screen, not the whole archive. Encrypted
 * entries and ZIP64 archives are refused, and so is an entry that claims to be larger than any
 * book's chapter could be — an archive is a file someone else made.
 */

export interface ZipEntry {
    name: string;
    /** 0 stored, 8 deflated. */
    method: number;
    compressedSize: number;
    size: number;
    /** Where its local header starts. */
    offset: number;
}

/** Turns raw-deflated bytes into the original ones. */
export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

/** No single entry of a book is bigger than this; anything that says so is not a book. */
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class ZipError extends Error {}

function u16(data: Uint8Array, at: number): number {
    return data[at] | (data[at + 1] << 8);
}

function u32(data: Uint8Array, at: number): number {
    return (data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24)) >>> 0;
}

const utf8 = new TextDecoder("utf-8");

/** The entries of an archive, read from its central directory. Throws {@link ZipError}. */
export function readZipDirectory(data: Uint8Array): ZipEntry[] {
    // The end record sits in the last 22 bytes, after a comment of at most 64 KB.
    let end = -1;
    for (let at = data.length - 22; at >= Math.max(0, data.length - 22 - 0xffff); at--) {
        if (u32(data, at) === EOCD) {
            end = at;
            break;
        }
    }
    if (end < 0) throw new ZipError("not a zip archive");
    const count = u16(data, end + 10);
    const start = u32(data, end + 16);
    if (count === 0xffff || start === 0xffffffff) throw new ZipError("zip64 archives are not supported");
    const entries: ZipEntry[] = [];
    let at = start;
    for (let i = 0; i < count; i++) {
        if (at + 46 > data.length || u32(data, at) !== CENTRAL) throw new ZipError("broken central directory");
        const flags = u16(data, at + 8);
        const method = u16(data, at + 10);
        const compressedSize = u32(data, at + 20);
        const size = u32(data, at + 24);
        const nameLength = u16(data, at + 28);
        const extraLength = u16(data, at + 30);
        const commentLength = u16(data, at + 32);
        const offset = u32(data, at + 42);
        const name = utf8.decode(data.subarray(at + 46, at + 46 + nameLength));
        at += 46 + nameLength + extraLength + commentLength;
        if (flags & 1) continue; // encrypted: nothing a reader can open
        if (name.endsWith("/")) continue; // a folder
        entries.push({ name, method, compressedSize, size, offset });
    }
    return entries;
}

/** The bytes of one entry. Throws {@link ZipError}. */
export async function readZipEntry(data: Uint8Array, entry: ZipEntry, inflate: Inflate): Promise<Uint8Array> {
    if (entry.size > MAX_ENTRY_BYTES || entry.compressedSize > MAX_ENTRY_BYTES) throw new ZipError(`${entry.name} is too large`);
    const at = entry.offset;
    if (at + 30 > data.length || u32(data, at) !== LOCAL) throw new ZipError(`broken entry ${entry.name}`);
    const begin = at + 30 + u16(data, at + 26) + u16(data, at + 28);
    const raw = data.subarray(begin, begin + entry.compressedSize);
    if (raw.length !== entry.compressedSize) throw new ZipError(`truncated entry ${entry.name}`);
    if (entry.method === 0) return raw;
    if (entry.method !== 8) throw new ZipError(`unsupported compression in ${entry.name}`);
    const out = await inflate(raw);
    if (out.length > MAX_ENTRY_BYTES) throw new ZipError(`${entry.name} is too large`);
    return out;
}

/** An archive opened once and read entry by entry. */
export class ZipArchive {
    private readonly byName = new Map<string, ZipEntry>();

    constructor(
        private readonly data: Uint8Array,
        private readonly inflate: Inflate = inflateRaw
    ) {
        for (const entry of readZipDirectory(data)) this.byName.set(entry.name, entry);
    }

    names(): string[] {
        return [...this.byName.keys()];
    }

    has(name: string): boolean {
        return this.byName.has(name);
    }

    /** The bytes of `name`, or `null` when the archive has no such entry. */
    async bytes(name: string): Promise<Uint8Array | null> {
        const entry = this.byName.get(name) ?? this.byName.get(decodeName(name));
        return entry ? readZipEntry(this.data, entry, this.inflate) : null;
    }

    /** The text of `name`, as UTF-8, or `null`. */
    async text(name: string): Promise<string | null> {
        const bytes = await this.bytes(name);
        return bytes ? utf8.decode(bytes) : null;
    }
}

/** A name written as a URL inside the book (`My%20Chapter.xhtml`) is stored as plain text. */
function decodeName(name: string): string {
    try {
        return decodeURIComponent(name);
    } catch {
        return name;
    }
}

/** The platform's own raw-deflate, through a stream: nothing bundled decompresses. */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

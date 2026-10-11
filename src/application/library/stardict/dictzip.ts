import type { Inflate } from "../zip";
import type { StardictRead } from "./ifo";

/**
 * **A `.dict.dz`: dictzip** (#766 FR-4) — pure over bytes; the inflating is handed in (the platform's
 * own `DecompressionStream("deflate-raw")` in the app: nothing bundled decompresses).
 *
 * A dictzip is an ordinary gzip file whose deflate stream is cut into chunks of a fixed length, with
 * a **full flush** after each — so each chunk inflates on its own — and a table of the chunks'
 * compressed sizes in the gzip header's `FEXTRA` field, subfield `RA`. A look-up inflates only the
 * chunks its entry spans. A gzip with no `RA` table is inflated whole, once.
 */
export interface DictzipHeader {
    /** Where the deflate data starts. */
    dataStart: number;
    /** Uncompressed bytes per chunk, and where each chunk's compressed bytes start. `null`: no table. */
    chunks: { length: number; starts: number[]; sizes: number[] } | null;
}

const FHCRC = 2;
const FEXTRA = 4;
const FNAME = 8;
const FCOMMENT = 16;

function u16(data: Uint8Array, at: number): number {
    return data[at] | (data[at + 1] << 8);
}

/** Skip a NUL-terminated field; -1 when it runs off the end. */
function skipString(data: Uint8Array, at: number): number {
    while (at < data.length && data[at] !== 0) at++;
    return at < data.length ? at + 1 : -1;
}

export function readDictzipHeader(data: Uint8Array): StardictRead<DictzipHeader> {
    if (data.length < 18 || data[0] !== 0x1f || data[1] !== 0x8b || data[2] !== 8) return { ok: false, reason: "bad-dict" };
    const flags = data[3];
    let at = 10;
    let chunks: DictzipHeader["chunks"] = null;
    if (flags & FEXTRA) {
        if (at + 2 > data.length) return { ok: false, reason: "bad-dict" };
        const xlen = u16(data, at);
        at += 2;
        const end = at + xlen;
        if (end > data.length) return { ok: false, reason: "bad-dict" };
        let sub = at;
        while (sub + 4 <= end) {
            const len = u16(data, sub + 2);
            const body = sub + 4;
            if (body + len > end) return { ok: false, reason: "bad-dict" };
            if (data[sub] === 0x52 && data[sub + 1] === 0x41 && len >= 6) {
                const length = u16(data, body + 2);
                const count = u16(data, body + 4);
                if (length === 0 || len < 6 + 2 * count) return { ok: false, reason: "bad-dict" };
                const sizes: number[] = [];
                for (let i = 0; i < count; i++) sizes.push(u16(data, body + 6 + 2 * i));
                chunks = { length, starts: [], sizes };
            }
            sub = body + len;
        }
        at = end;
    }
    if (flags & FNAME) at = skipString(data, at);
    if (at >= 0 && flags & FCOMMENT) at = skipString(data, at);
    if (at >= 0 && flags & FHCRC) at += 2;
    if (at < 0 || at > data.length) return { ok: false, reason: "bad-dict" };
    if (chunks) {
        let start = at;
        for (const size of chunks.sizes) {
            chunks.starts.push(start);
            start += size;
        }
        // The table must fit the file it describes (with gzip's eight-byte trailer after it).
        if (start > data.length) return { ok: false, reason: "bad-dict" };
    }
    return { ok: true, value: { dataStart: at, chunks } };
}

/**
 * A full flush leaves a chunk byte-aligned and with no final block: one empty, final stored block
 * after it (`BFINAL=1`, `LEN=0`, `NLEN=0xFFFF`) makes it a complete raw deflate stream, which every
 * inflater accepts. The member's last chunk already has its final block.
 */
const FINAL_EMPTY_BLOCK = Uint8Array.of(0x01, 0x00, 0x00, 0xff, 0xff);

/** The bytes `[offset, offset + size)` of the uncompressed text, inflating only the chunks they span. */
export async function readDictzipRange(data: Uint8Array, header: DictzipHeader, offset: number, size: number, inflate: Inflate): Promise<StardictRead<Uint8Array>> {
    const chunks = header.chunks;
    if (!chunks) return { ok: false, reason: "bad-dict" };
    if (size === 0) return { ok: true, value: new Uint8Array(0) };
    const first = Math.floor(offset / chunks.length);
    const last = Math.floor((offset + size - 1) / chunks.length);
    if (last >= chunks.sizes.length) return { ok: false, reason: "bad-dict" };
    const parts: Uint8Array[] = [];
    try {
        for (let i = first; i <= last; i++) {
            const raw = data.subarray(chunks.starts[i], chunks.starts[i] + chunks.sizes[i]);
            const input = i === chunks.sizes.length - 1 ? raw : concat([raw, FINAL_EMPTY_BLOCK]);
            parts.push(await inflate(input));
        }
    } catch {
        return { ok: false, reason: "bad-dict" };
    }
    const joined = concat(parts);
    const from = offset - first * chunks.length;
    if (from + size > joined.length) return { ok: false, reason: "bad-dict" };
    return { ok: true, value: joined.subarray(from, from + size) };
}

/** The whole text of a gzip with no chunk table: its one member, inflated once. */
export async function inflateWhole(data: Uint8Array, header: DictzipHeader, inflate: Inflate): Promise<StardictRead<Uint8Array>> {
    if (data.length < header.dataStart + 8) return { ok: false, reason: "bad-dict" };
    try {
        return { ok: true, value: await inflate(data.subarray(header.dataStart, data.length - 8)) };
    } catch {
        return { ok: false, reason: "bad-dict" };
    }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
    if (parts.length === 1) return parts[0];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

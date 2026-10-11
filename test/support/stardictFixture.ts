import { constants, deflateRawSync } from "zlib";

/**
 * **A StarDict dictionary, built in the test** (#766 T1). Nothing is downloaded or committed: the
 * files are made here, byte for byte as the format says — `.ifo`, `.idx` (32- or 64-bit offsets),
 * `.dict`, `.dict.dz` (dictzip: a full flush per chunk and the `RA` chunk table, or a plain gzip with
 * no table), and `.syn`.
 */
export interface FixtureEntry {
    word: string;
    /** The entry's text (the `sametypesequence` part), or its typed parts when there is none. */
    definition?: string;
    parts?: { type: string; data: string | Uint8Array }[];
    synonyms?: string[];
}

export interface FixtureOptions {
    bookname?: string;
    bits?: 32 | 64;
    /** `m` by default; `null` writes typed parts. */
    sametypesequence?: string | null;
    /** `ra` a dictzip with its chunk table, `whole` a gzip with none, `false` a plain `.dict`. */
    dz?: "ra" | "whole" | false;
    chunk?: number;
    lang?: string;
    extraIfo?: string;
}

export interface FixtureDictionary {
    ifo: string;
    idx: Uint8Array;
    dict: Uint8Array;
    syn?: Uint8Array;
    /** The uncompressed `.dict`, for a test that reads ranges. */
    text: Uint8Array;
}

const enc = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

function u32be(n: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, n);
    return out;
}

function entryBytes(entry: FixtureEntry, sts: string | null): Uint8Array {
    if (sts) return enc.encode(entry.definition ?? "");
    const parts = entry.parts ?? [{ type: "m", data: entry.definition ?? "" }];
    return concat(
        parts.flatMap((part) => {
            const data = typeof part.data === "string" ? enc.encode(part.data) : part.data;
            const binary = part.type >= "A" && part.type <= "Z";
            return [enc.encode(part.type), ...(binary ? [u32be(data.length), data] : [data, Uint8Array.of(0)])];
        })
    );
}

/** A dictzip: one deflate stream, a full flush every `chunk` bytes, and the `RA` table in the header. */
export function dictzip(text: Uint8Array, chunk: number, withTable = true): Uint8Array {
    const pieces: Uint8Array[] = [];
    for (let at = 0; at < text.length || at === 0; at += chunk) {
        const last = at + chunk >= text.length;
        pieces.push(new Uint8Array(deflateRawSync(text.subarray(at, at + chunk), last ? {} : { finishFlush: constants.Z_FULL_FLUSH })));
        if (last) break;
    }
    const head = [0x1f, 0x8b, 8, withTable ? 4 : 0, 0, 0, 0, 0, 0, 3];
    const extra: number[] = [];
    if (withTable) {
        const len = 6 + 2 * pieces.length;
        const sub = [0x52, 0x41, len & 0xff, len >> 8, 1, 0, chunk & 0xff, chunk >> 8, pieces.length & 0xff, pieces.length >> 8];
        for (const piece of pieces) sub.push(piece.length & 0xff, piece.length >> 8);
        extra.push(sub.length & 0xff, sub.length >> 8, ...sub);
    }
    const trailer = new Uint8Array(8);
    new DataView(trailer.buffer).setUint32(4, text.length, true);
    return concat([Uint8Array.from(head), Uint8Array.from(extra), ...pieces, trailer]);
}

export function buildStardict(entries: readonly FixtureEntry[], options: FixtureOptions = {}): FixtureDictionary {
    const bits = options.bits ?? 32;
    const sts = options.sametypesequence === undefined ? "m" : options.sametypesequence;
    const bodies: Uint8Array[] = [];
    const idxParts: Uint8Array[] = [];
    const synParts: Uint8Array[] = [];
    let offset = 0;
    let synCount = 0;
    entries.forEach((entry, i) => {
        const body = entryBytes(entry, sts);
        bodies.push(body);
        const record = new Uint8Array(bits === 64 ? 12 : 8);
        const view = new DataView(record.buffer);
        if (bits === 64) {
            view.setUint32(0, Math.floor(offset / 2 ** 32));
            view.setUint32(4, offset % 2 ** 32);
            view.setUint32(8, body.length);
        } else {
            view.setUint32(0, offset);
            view.setUint32(4, body.length);
        }
        idxParts.push(enc.encode(entry.word), Uint8Array.of(0), record);
        offset += body.length;
        for (const synonym of entry.synonyms ?? []) {
            synParts.push(enc.encode(synonym), Uint8Array.of(0), u32be(i));
            synCount++;
        }
    });
    const idx = concat(idxParts);
    const text = concat(bodies);
    const dz = options.dz ?? false;
    const dict = dz === "ra" ? dictzip(text, options.chunk ?? 64) : dz === "whole" ? dictzip(text, Math.max(1, text.length), false) : text;
    const ifo = [
        "StarDict's dict ifo file",
        `version=${bits === 64 ? "3.0.0" : "2.4.2"}`,
        `bookname=${options.bookname ?? "Test dictionary"}`,
        `wordcount=${entries.length}`,
        ...(synCount ? [`synwordcount=${synCount}`] : []),
        `idxfilesize=${idx.length}`,
        ...(bits === 64 ? ["idxoffsetbits=64"] : []),
        ...(sts ? [`sametypesequence=${sts}`] : []),
        ...(options.lang ? [`lang=${options.lang}`] : []),
        ...(options.extraIfo ? [options.extraIfo] : []),
        "",
    ].join("\n");
    return { ifo, idx, dict, text, ...(synCount ? { syn: concat(synParts) } : {}) };
}

/** A dictionary of `n` made-up words, `w0` … `w{n-1}`, for the budget. */
export function generateDictionary(n: number, options: FixtureOptions = {}): FixtureDictionary {
    const entries: FixtureEntry[] = [];
    for (let i = 0; i < n; i++) entries.push({ word: `palabra${i}`, definition: `definición número ${i}: una palabra inventada para medir.`, ...(i % 4 === 0 ? { synonyms: [`forma${i}`] } : {}) });
    return buildStardict(entries, { dz: "ra", chunk: 32_768, ...options });
}

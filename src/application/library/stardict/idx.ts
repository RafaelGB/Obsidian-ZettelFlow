import type { StardictRead } from "./ifo";

/**
 * **A StarDict index (`.idx`)** (#766) — pure. One record per headword: the word, NUL-terminated
 * UTF-8, then where its entry is in the `.dict` and how long it is — two big-endian numbers, the
 * offset 32 or 64 bits wide (the `.ifo` says which), the size 32.
 *
 * The table is kept compact — typed arrays over the file's own bytes — and the words are decoded
 * once, when the look-up table is built. The file's sort order is never relied on: a `Map` is built
 * from whatever order it is in.
 */
export interface IdxTable {
    count: number;
    bytes: Uint8Array;
    /** Where each word starts and ends (its NUL) in `bytes`. */
    wordStart: Uint32Array;
    wordEnd: Uint32Array;
    /** Where its entry is in the `.dict`, and how long it is. */
    offset: Float64Array;
    size: Uint32Array;
}

/** A word longer than this is not a headword: the file is not an index. */
const MAX_WORD_BYTES = 256;

export function parseIdx(bytes: Uint8Array, bits: 32 | 64, expected?: { count?: number; size?: number }): StardictRead<IdxTable> {
    if (expected?.size !== undefined && expected.size !== bytes.length) return { ok: false, reason: "bad-idx" };
    const width = bits === 64 ? 12 : 8;
    // At least two bytes a record (an empty word is not one): a bound on what to allocate.
    const most = expected?.count ?? Math.ceil(bytes.length / (width + 2));
    if (most > bytes.length) return { ok: false, reason: "bad-idx" };
    const wordStart = new Uint32Array(most);
    const wordEnd = new Uint32Array(most);
    const offset = new Float64Array(most);
    const size = new Uint32Array(most);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    let n = 0;
    while (at < bytes.length) {
        if (n >= most) return { ok: false, reason: "bad-idx" };
        const start = at;
        const limit = Math.min(bytes.length, start + MAX_WORD_BYTES + 1);
        while (at < limit && bytes[at] !== 0) at++;
        if (at >= limit || at === start) return { ok: false, reason: "bad-idx" };
        const end = at;
        at++;
        if (at + width > bytes.length) return { ok: false, reason: "bad-idx" };
        wordStart[n] = start;
        wordEnd[n] = end;
        offset[n] = bits === 64 ? view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4) : view.getUint32(at);
        size[n] = view.getUint32(at + width - 4);
        at += width;
        n++;
    }
    if (expected?.count !== undefined && n !== expected.count) return { ok: false, reason: "bad-idx" };
    return {
        ok: true,
        value: { count: n, bytes, wordStart: wordStart.subarray(0, n), wordEnd: wordEnd.subarray(0, n), offset: offset.subarray(0, n), size: size.subarray(0, n) },
    };
}

const utf8 = new TextDecoder("utf-8");

/** A NUL-terminated word of the file: ASCII read directly, anything else through the decoder. */
export function decodeWord(bytes: Uint8Array, start: number, end: number): string {
    let ascii = true;
    for (let i = start; i < end; i++) {
        if (bytes[i] >= 0x80) {
            ascii = false;
            break;
        }
    }
    if (!ascii) return utf8.decode(bytes.subarray(start, end));
    let out = "";
    for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

/** The headword of record `i`. */
export function idxWord(table: IdxTable, i: number): string {
    return decodeWord(table.bytes, table.wordStart[i], table.wordEnd[i]);
}

/** The languages whose case-folding is not the default one. */
const LOCALE_FOLDS = new Set(["tr", "az", "lt"]);

/**
 * Case-folding, by the dictionary's language when it has one (Turkish folds *İ* to *i*), and never
 * accents: FR-6 matches "ignoring case", and no more — *cása* is not *casa*.
 */
export function foldWord(word: string, language?: string): string {
    // Only Turkish, Azeri and Lithuanian fold differently by locale — and the locale-aware fold is
    // several times slower over a 200,000-word index (#766 AC-10).
    if (!language || !LOCALE_FOLDS.has(language.split(/[-_]/)[0].toLowerCase())) return word.toLowerCase();
    try {
        return word.toLocaleLowerCase(language);
    } catch {
        return word.toLowerCase();
    }
}

/**
 * Many NUL-terminated words, decoded at once: their bytes gathered into one buffer, NUL between them
 * (a word never holds one), and one native decode — a decode per word costs ten times as much over a
 * 200,000-word index (#766 AC-10).
 */
export function decodeWords(bytes: Uint8Array, starts: ArrayLike<number>, ends: ArrayLike<number>, count: number): string[] {
    if (count === 0) return [];
    let total = 0;
    for (let i = 0; i < count; i++) total += ends[i] - starts[i] + 1;
    const joined = new Uint8Array(total);
    let at = 0;
    for (let i = 0; i < count; i++) {
        joined.set(bytes.subarray(starts[i], ends[i]), at);
        at += ends[i] - starts[i] + 1;
    }
    const words = utf8.decode(joined.subarray(0, total - 1)).split(String.fromCharCode(0));
    return words.length === count ? words : Array.from({ length: count }, (_, i) => decodeWord(bytes, starts[i], ends[i]));
}

/** Every folded headword, and the records it is the word of. */
export function buildLookup(table: IdxTable, language?: string): Map<string, number[]> {
    const map = new Map<string, number[]>();
    const words = decodeWords(table.bytes, table.wordStart, table.wordEnd, table.count);
    for (let i = 0; i < table.count; i++) {
        const key = foldWord(words[i], language);
        const held = map.get(key);
        if (held) held.push(i);
        else map.set(key, [i]);
    }
    return map;
}

import { foldWord } from "./idx";
import type { StardictRead } from "./ifo";

/**
 * **A StarDict synonym file (`.syn`)** (#766 FR-6) — pure. One record per synonym: the word,
 * NUL-terminated UTF-8, then the index of the headword it leads to — a big-endian 32-bit number. In
 * many builds the synonyms are the word's inflected forms, so *corrió* finds *correr*. A synonym
 * that points past the index is skipped; a file that is not one gives a reason.
 *
 * A real one is large — the Wiktionary Spanish build carries a million forms in 16 MB — so it is not
 * a `Map` of a million strings (that cost 840 ms to build, in the walk): the words are decoded and
 * folded in one native pass into one string, and a compact open-addressing table of their positions
 * finds a word in it. Built in a fraction of the time, a look-up still answers at once.
 */
export interface SynonymIndex {
    /** The headword records `key` (already folded) leads to, or nothing. */
    get(key: string): readonly number[] | undefined;
    /** How many synonyms it holds. */
    readonly size: number;
}

const SEPARATOR = 0;

/** FNV-1a over a span of the folded text: the table's hash. */
function hashSpan(text: string, start: number, end: number): number {
    let h = 0x811c9dc5;
    for (let i = start; i < end; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function parseSyn(bytes: Uint8Array, headwords: number, language?: string): StardictRead<SynonymIndex> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // At least six bytes a record (a one-byte word, its NUL and its index): a bound on what to allocate.
    const most = Math.ceil(bytes.length / 6) + 1;
    const joined = new Uint8Array(bytes.length);
    const targets = new Uint32Array(most);
    let n = 0;
    let written = 0;
    let at = 0;
    while (at < bytes.length) {
        const start = at;
        const limit = Math.min(bytes.length, start + 257);
        while (at < limit && bytes[at] !== 0) at++;
        if (at >= limit || at === start || at + 5 > bytes.length) return { ok: false, reason: "bad-syn" };
        if (n > 0) joined[written++] = SEPARATOR;
        joined.set(bytes.subarray(start, at), written);
        written += at - start;
        targets[n++] = view.getUint32(at + 1);
        at += 5;
    }
    // One decode and one fold for every word: the platform's own, on one string.
    const text = foldWord(new TextDecoder("utf-8").decode(joined.subarray(0, written)), language);
    const starts = new Uint32Array(n + 1);
    let word = 0;
    for (let i = 0; i < text.length && word < n; i++) if (text.charCodeAt(i) === SEPARATOR) starts[++word] = i + 1;
    // A word whose folding made a separator of its own is not one this table can trust.
    if (word !== n - 1 && n > 0) return { ok: false, reason: "bad-syn" };
    starts[n] = text.length + 1;
    let capacity = 1;
    while (capacity < n * 2) capacity <<= 1;
    const mask = capacity - 1;
    const table = new Int32Array(capacity).fill(-1);
    let size = 0;
    for (let i = 0; i < n; i++) {
        if (targets[i] >= headwords) continue;
        let slot = hashSpan(text, starts[i], starts[i + 1] - 1) & mask;
        while (table[slot] !== -1) slot = (slot + 1) & mask;
        table[slot] = i;
        size++;
    }
    const same = (i: number, key: string): boolean => {
        const start = starts[i];
        const length = starts[i + 1] - 1 - start;
        if (length !== key.length) return false;
        for (let k = 0; k < length; k++) if (text.charCodeAt(start + k) !== key.charCodeAt(k)) return false;
        return true;
    };
    return {
        ok: true,
        value: {
            size,
            get(key: string) {
                if (!key || size === 0) return undefined;
                const found: number[] = [];
                for (let slot = hashSpan(key, 0, key.length) & mask; table[slot] !== -1; slot = (slot + 1) & mask) {
                    const i = table[slot];
                    if (same(i, key) && !found.includes(targets[i])) found.push(targets[i]);
                }
                return found.length ? found : undefined;
            },
        },
    };
}

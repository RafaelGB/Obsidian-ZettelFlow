/**
 * **A StarDict entry, split into what can be shown** (#766 FR-7) — pure.
 *
 * An entry in the `.dict` is a sequence of typed parts. With `sametypesequence` in the `.ifo` the
 * types are given there, in order, and the data follows bare; without it, each part starts with its
 * type letter. A lower-case type is text, NUL-terminated (the last part of a `sametypesequence` entry
 * runs to the end instead); an upper-case one is binary, after its big-endian 32-bit size (the last
 * one of a `sametypesequence` entry, again, runs to the end).
 *
 * What is shown: plain and phonetic text (`m`, `l`, `t`, `y`) as text; HTML (`h`), XDXF (`x`) and
 * Pango (`g`) through the dictionary profile of the sanitiser. Sounds, pictures, resource lists and
 * the formats this does not read (`k`, `w`, `r`, `W`, `P`, `X`, …) are left out.
 */
export interface EntryPart {
    type: string;
    data: Uint8Array;
}

export type ShownPart = { kind: "text"; text: string; phonetic: boolean } | { kind: "markup"; markup: "html" | "xdxf" | "pango"; text: string };

const TEXT_TYPES = new Set(["m", "l", "t", "y"]);
const MARKUP: Record<string, "html" | "xdxf" | "pango"> = { h: "html", x: "xdxf", g: "pango" };

/** An entry's parts. A part that runs off the end ends the entry: what was read is kept. */
export function splitEntry(bytes: Uint8Array, sametypesequence?: string): EntryPart[] {
    const parts: EntryPart[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    const read = (type: string, last: boolean): boolean => {
        const binary = type >= "A" && type <= "Z";
        if (last) {
            parts.push({ type, data: bytes.subarray(at) });
            at = bytes.length;
            return true;
        }
        if (binary) {
            if (at + 4 > bytes.length) return false;
            const size = view.getUint32(at);
            at += 4;
            if (at + size > bytes.length) return false;
            parts.push({ type, data: bytes.subarray(at, at + size) });
            at += size;
            return true;
        }
        let end = at;
        while (end < bytes.length && bytes[end] !== 0) end++;
        parts.push({ type, data: bytes.subarray(at, end) });
        at = Math.min(bytes.length, end + 1);
        return true;
    };
    if (sametypesequence) {
        const types = sametypesequence.split("");
        types.forEach((type, i) => {
            if (at <= bytes.length) read(type, i === types.length - 1);
        });
        return parts;
    }
    while (at < bytes.length) {
        const type = String.fromCharCode(bytes[at]);
        if (!/^[a-zA-Z]$/.test(type)) break;
        at++;
        if (!read(type, false)) break;
    }
    return parts;
}

const utf8 = new TextDecoder("utf-8");

/** The parts a reader can see, in order; an unshowable one is left out. */
export function shownParts(parts: readonly EntryPart[]): ShownPart[] {
    const out: ShownPart[] = [];
    for (const part of parts) {
        const text = utf8.decode(part.data).trim();
        if (!text) continue;
        if (TEXT_TYPES.has(part.type)) out.push({ kind: "text", text, phonetic: part.type === "t" || part.type === "y" });
        else if (MARKUP[part.type]) out.push({ kind: "markup", markup: MARKUP[part.type], text });
    }
    return out;
}

import { describe, it, expect } from "@jest/globals";
import { inflateRaw } from "application/library/zip";
import {
    buildLookup,
    idxWord,
    inflateWhole,
    parseIdx,
    parseIfo,
    parseSyn,
    readDictzipHeader,
    readDictzipRange,
    type IdxTable,
} from "application/library/stardict";
import { buildStardict, type FixtureEntry } from "../../../support/stardictFixture";

/**
 * **StarDict, read** (#766 AC-1) — over dictionaries built in the test, byte for byte as the format
 * says. Every reader gives a value or a reason, and never throws.
 */
const ENTRIES: FixtureEntry[] = [
    { word: "casa", definition: "Edificio para habitar." },
    { word: "correr", definition: "Ir deprisa.", synonyms: ["corrió", "corriendo"] },
    { word: "Árbol", definition: "Planta perenne, de tronco leñoso. ".repeat(6) },
    { word: "zarzamora", definition: "Fruto de la zarza." },
];
const dec = new TextDecoder();

function table(bits: 32 | 64 = 32): { table: IdxTable; built: ReturnType<typeof buildStardict> } {
    const built = buildStardict(ENTRIES, { bits });
    const ifo = parseIfo(built.ifo);
    if (!ifo.ok) throw new Error("ifo");
    const idx = parseIdx(built.idx, ifo.value.idxoffsetbits, { count: ifo.value.wordcount, size: ifo.value.idxfilesize });
    if (!idx.ok) throw new Error(idx.reason);
    return { table: idx.value, built };
}

describe("the .ifo (#766 AC-1)", () => {
    it("reads the name, the counts, the offset width, the entry types and a declared language", () => {
        const built = buildStardict(ENTRIES, { bookname: "Wiktionary (Spanish)", bits: 64, lang: "es-en" });
        const ifo = parseIfo(built.ifo);
        expect(ifo).toEqual({
            ok: true,
            value: { bookname: "Wiktionary (Spanish)", wordcount: 4, synwordcount: 2, idxfilesize: built.idx.length, idxoffsetbits: 64, sametypesequence: "m", lang: { from: "es", to: "en" } },
        });
    });

    it("reads one language as one, a region as part of it, and sourcelang/targetlang", () => {
        const lang = (line: string) => {
            const r = parseIfo(`StarDict's dict ifo file\nbookname=x\nwordcount=1\nidxfilesize=9\n${line}\n`);
            return r.ok ? r.value.lang : "bad";
        };
        expect(lang("lang=es")).toEqual({ from: "es" });
        expect(lang("lang=es-ES")).toEqual({ from: "es-ES" });
        expect(lang("sourcelang=de\ntargetlang=fr")).toEqual({ from: "de", to: "fr" });
        expect(lang("")).toBeUndefined();
        // FreeDict and the Wiktionary builds say it at the end of their name, and nowhere else.
        const named = parseIfo("StarDict's dict ifo file\nbookname=Spanish-English FreeDict Dictionary (es-en)\nwordcount=1\nidxfilesize=9\n");
        expect(named.ok && named.value.lang).toEqual({ from: "es", to: "en" });
        const plain = parseIfo("StarDict's dict ifo file\nbookname=Webster (1913)\nwordcount=1\nidxfilesize=9\n");
        expect(plain.ok && plain.value.lang).toBeUndefined();
    });

    it("gives a reason, never a throw, for a missing magic line or missing fields", () => {
        expect(parseIfo("bookname=x\nwordcount=1\nidxfilesize=1")).toEqual({ ok: false, reason: "bad-ifo" });
        expect(parseIfo("StarDict's dict ifo file\nbookname=x\n")).toEqual({ ok: false, reason: "bad-ifo" });
        expect(parseIfo("StarDict's dict ifo file\nbookname=x\nwordcount=1\nidxfilesize=1\nidxoffsetbits=48")).toEqual({ ok: false, reason: "bad-ifo" });
        expect(parseIfo("\u0000\u0001garbage")).toEqual({ ok: false, reason: "bad-ifo" });
    });
});

describe("the .idx, at 32 and 64 bits (#766 AC-1)", () => {
    it.each([32, 64] as const)("finds every entry with %i-bit offsets", (bits) => {
        const { table: t, built } = table(bits);
        expect(t.count).toBe(4);
        expect([0, 1, 2, 3].map((i) => idxWord(t, i))).toEqual(["casa", "correr", "Árbol", "zarzamora"]);
        const text = (i: number) => dec.decode(built.text.subarray(t.offset[i], t.offset[i] + t.size[i]));
        expect(text(0)).toBe("Edificio para habitar.");
        expect(text(3)).toBe("Fruto de la zarza.");
    });

    it("builds a case-folded table, with no accent folding", () => {
        const map = buildLookup(table().table, "es");
        expect(map.get("árbol")).toEqual([2]);
        expect(map.get("arbol")).toBeUndefined();
        expect(map.get("casa")).toEqual([0]);
    });

    it("gives a reason for a truncated, wrong-sized or garbage index", () => {
        const { built } = table();
        expect(parseIdx(built.idx.subarray(0, built.idx.length - 3), 32)).toEqual({ ok: false, reason: "bad-idx" });
        expect(parseIdx(built.idx, 32, { size: built.idx.length + 1 })).toEqual({ ok: false, reason: "bad-idx" });
        expect(parseIdx(built.idx, 32, { count: 5 })).toEqual({ ok: false, reason: "bad-idx" });
        expect(parseIdx(new Uint8Array(400).fill(0x41), 32)).toEqual({ ok: false, reason: "bad-idx" });
        expect(parseIdx(Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0), 32)).toEqual({ ok: false, reason: "bad-idx" });
    });
});

describe("the .dict and the .dict.dz (#766 AC-1, FR-4)", () => {
    it("gives the same entry from a .dict, from a dictzip chunk by chunk, and from a gzip with no table", async () => {
        const plain = buildStardict(ENTRIES);
        const ra = buildStardict(ENTRIES, { dz: "ra", chunk: 32 });
        const whole = buildStardict(ENTRIES, { dz: "whole" });
        const { table: t } = table();
        const raHeader = readDictzipHeader(ra.dict);
        expect(raHeader.ok && raHeader.value.chunks?.sizes.length).toBeGreaterThan(3);
        if (!raHeader.ok) throw new Error("header");
        for (let i = 0; i < t.count; i++) {
            const want = dec.decode(plain.dict.subarray(t.offset[i], t.offset[i] + t.size[i]));
            const got = await readDictzipRange(ra.dict, raHeader.value, t.offset[i], t.size[i], inflateRaw);
            expect(got.ok && dec.decode(got.value)).toBe(want);
        }
        const wholeHeader = readDictzipHeader(whole.dict);
        if (!wholeHeader.ok) throw new Error("header");
        expect(wholeHeader.value.chunks).toBeNull();
        const all = await inflateWhole(whole.dict, wholeHeader.value, inflateRaw);
        expect(all.ok && dec.decode(all.value)).toBe(dec.decode(plain.text));
    });

    it("reads a range that spans two chunks, and only inflates those", async () => {
        const ra = buildStardict(ENTRIES, { dz: "ra", chunk: 32 });
        const header = readDictzipHeader(ra.dict);
        if (!header.ok) throw new Error("header");
        let calls = 0;
        const counted = async (bytes: Uint8Array) => {
            calls++;
            return inflateRaw(bytes);
        };
        const got = await readDictzipRange(ra.dict, header.value, 20, 30, counted);
        expect(got.ok && dec.decode(got.value)).toBe(dec.decode(ra.text.subarray(20, 50)));
        expect(calls).toBe(2);
    });

    it("gives a reason for a dictzip that is garbage or cut short", async () => {
        expect(readDictzipHeader(new Uint8Array(30))).toEqual({ ok: false, reason: "bad-dict" });
        const ra = buildStardict(ENTRIES, { dz: "ra", chunk: 32 });
        expect(readDictzipHeader(ra.dict.subarray(0, 40))).toEqual({ ok: false, reason: "bad-dict" });
        const header = readDictzipHeader(ra.dict);
        if (!header.ok) throw new Error("header");
        expect(await readDictzipRange(ra.dict, header.value, 10_000, 10, inflateRaw)).toEqual({ ok: false, reason: "bad-dict" });
        const broken = ra.dict.slice();
        broken.fill(0xff, header.value.dataStart, header.value.dataStart + 20);
        expect(await readDictzipRange(broken, header.value, 0, 10, inflateRaw)).toEqual({ ok: false, reason: "bad-dict" });
    });
});

describe("the .syn (#766 FR-6, AC-1)", () => {
    it("leads corrió to correr", () => {
        const built = buildStardict(ENTRIES);
        const syn = parseSyn(built.syn as Uint8Array, 4, "es");
        expect(syn.ok && syn.value.get("corrió")).toEqual([1]);
        expect(syn.ok && syn.value.get("corriendo")).toEqual([1]);
    });

    it("skips a synonym that points past the index, and gives a reason for garbage", () => {
        const built = buildStardict(ENTRIES);
        const syn = parseSyn(built.syn as Uint8Array, 1);
        expect(syn.ok && syn.value.size).toBe(0);
        expect(parseSyn(Uint8Array.of(0x61, 0x62, 0, 1), 4)).toEqual({ ok: false, reason: "bad-syn" });
    });
});

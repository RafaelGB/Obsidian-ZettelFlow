import { describe, it } from "@jest/globals";
import { TFile } from "obsidian";
import { DictionaryShelf } from "architecture/plugin/library/DictionaryShelf";
import { findWord, shownParts, splitEntry } from "application/library/stardict";
import { generateDictionary } from "../support/stardictFixture";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * Look up's budgets (#766 AC-10, FR-13). A generated 200,000-entry dictionary — a large real one,
 * Wiktionary-sized — with a synonym for every fourth word, as a dictzip in 32 KB chunks.
 *
 * Two things are timed apart, because the promise to the reader is two promises: the **first**
 * look-up opens the dictionary (its index and synonyms parsed into the table), which may take a
 * moment and then says *Opening …*; every **later** look-up answers at once.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

function shelfOf(): { shelf: DictionaryShelf; set: ReturnType<DictionaryShelf["list"]>[number] } {
    const built = generateDictionary(200_000);
    const enc = new TextEncoder();
    const files: Record<string, Uint8Array> = {
        "Dictionaries/big.ifo": enc.encode(built.ifo),
        "Dictionaries/big.idx": built.idx,
        "Dictionaries/big.syn": built.syn as Uint8Array,
        "Dictionaries/big.dict.dz": built.dict,
    };
    const made = Object.entries(files).map(([path, bytes]) => {
        const file = new TFile() as TFile & { stat: { size: number; mtime: number; ctime: number } };
        (file as unknown as { path: string }).path = path;
        file.stat = { size: bytes.length, mtime: 1, ctime: 1 };
        return { file, bytes };
    });
    const vault = {
        getFiles: () => made.map((m) => m.file),
        readBinary: async (file: TFile) => {
            const found = made.find((m) => m.file === file);
            if (!found) throw new Error("missing");
            return found.bytes.buffer.slice(found.bytes.byteOffset, found.bytes.byteOffset + found.bytes.byteLength) as ArrayBuffer;
        },
    };
    const shelf = new DictionaryShelf(() => vault, { tooLarge: () => false });
    return { shelf, set: shelf.list("Dictionaries")[0] };
}

describe("look up in your own dictionaries (#766 AC-10)", () => {
    it("opens a 200,000-entry dictionary once: its index and synonyms into the table", async () => {
        let fastest = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 3; i++) {
            const { shelf, set } = shelfOf();
            const started = performance.now();
            const opened = await shelf.open(set, { from: "es" });
            fastest = Math.min(fastest, performance.now() - started);
            if (!opened.ok) throw new Error(opened.reason);
        }
        assertBudget("reader.lookup.stardict.open.200k", fastest);
    });

    it("answers a later look-up at once: the word found and its entry inflated from its chunk", async () => {
        const { shelf, set } = shelfOf();
        const opened = await shelf.open(set, { from: "es" });
        if (!opened.ok) throw new Error(opened.reason);
        const dictionary = opened.dictionary;
        let fastest = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 20; i++) {
            const word = i % 2 === 0 ? `palabra${(i * 9_973) % 200_000}` : `forma${((i * 4_001) % 50_000) * 4}`;
            const started = performance.now();
            const hits = findWord([dictionary], word, "en");
            const bytes = hits[0] ? await dictionary.entry(hits[0].records[0]) : null;
            const shown = bytes ? shownParts(splitEntry(bytes, dictionary.sametypesequence)) : [];
            fastest = Math.min(fastest, performance.now() - started);
            if (shown.length === 0) throw new Error(`no entry for ${word}`);
        }
        assertBudget("reader.lookup.stardict.find.200k", fastest);
    });
});

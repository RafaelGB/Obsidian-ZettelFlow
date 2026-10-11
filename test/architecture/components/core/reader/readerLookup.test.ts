/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Component, TFile, __setRequestUrl } from "obsidian";
import { DomNode, flush, installBrowserGlobals, settle } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { withPlatform, IPAD } from "../../../../support/platform";
import { parseXml } from "../../../../support/miniXml";
import { buildStardict, dictzip, type FixtureEntry, type FixtureOptions } from "../../../../support/stardictFixture";
import { DictionaryShelf } from "architecture/plugin/library/DictionaryShelf";
import { ReaderLookup, OPENING_MS, OPENING_DWELL_MS, DICTIONARIES_DOCS_URL, type LookupView } from "architecture/components/core/reader/readerLookup";
import { ReaderHighlights, type HighlightStore, type LookupActions, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { ReaderAiQueue } from "architecture/plugin/thinking/readerAiQueue";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { dismissNewestOf } from "architecture/components/core/reader/readerProposal";
import { dictionarySettings, type DictionarySettings } from "application/library/dictionarySettings";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import type { AiGateState } from "architecture/ai/aiGate";
import type { SourceNode } from "application/library/epubSanitize";

/**
 * **Look up and translate** (#766). Real StarDict dictionaries, built in the test, on a fake vault
 * whose every read is counted; the AI provider is a promise the test settles by hand.
 */

type Files = Record<string, Uint8Array | string>;
const enc = new TextEncoder();

function vaultOf(files: Files) {
    const made = Object.entries(files).map(([path, data]) => {
        const file = new TFile() as TFile & { stat: { size: number; mtime: number; ctime: number } };
        (file as any).path = path;
        const bytes = typeof data === "string" ? enc.encode(data) : data;
        file.stat = { size: bytes.length, mtime: 1, ctime: 1 };
        return { file, bytes };
    });
    const reads: string[] = [];
    const vault = {
        getFiles: jest.fn(() => made.map((m) => m.file)),
        readBinary: jest.fn(async (file: TFile) => {
            reads.push(file.path);
            const found = made.find((m) => m.file === file);
            if (!found) throw new Error("no such file");
            return found.bytes.buffer.slice(found.bytes.byteOffset, found.bytes.byteOffset + found.bytes.byteLength);
        }),
        // Never called — the shelf has no way to call them; they are here to be counted.
        create: jest.fn(),
        modify: jest.fn(),
        adapter: { read: jest.fn(), readBinary: jest.fn(), write: jest.fn() },
    };
    return { vault, reads };
}

function dictionaryFiles(base: string, entries: FixtureEntry[], options: FixtureOptions = {}, skip: string[] = []): Files {
    const built = buildStardict(entries, options);
    const files: Files = { [`${base}.ifo`]: built.ifo, [`${base}.idx`]: built.idx, [`${base}${options.dz ? ".dict.dz" : ".dict"}`]: built.dict };
    if (built.syn) files[`${base}.syn`] = built.syn;
    for (const ext of skip) delete files[`${base}${ext}`];
    return files;
}

const SPANISH: FixtureEntry[] = [
    { word: "casa", definition: "<b>casa</b> <i>f.</i> Edificio para habitar.<script>alert(1)</script><ul><li>hogar</li></ul>" },
    { word: "correr", definition: "<b>correr</b> Ir deprisa.", synonyms: ["corrió"] },
];
const SPANISH_ENGLISH: FixtureEntry[] = [{ word: "casa", definition: "house; home" }];

function standardFiles(): Files {
    return {
        ...dictionaryFiles("Dictionaries/es/wiktionary-es", SPANISH, { bookname: "Wiktionary (Spanish)", lang: "es", sametypesequence: "h", dz: "ra", chunk: 16 }),
        ...dictionaryFiles("Dictionaries/spa-eng", SPANISH_ENGLISH, { bookname: "FreeDict spa-eng", lang: "es-en" }),
        "Notes/a.md": "# a",
    };
}

const parse = (markup: string): SourceNode | null => parseXml(`<root>${markup}</root>`).documentElement as unknown as SourceNode;

function deferred() {
    let resolve!: (text: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function harness(options: { files?: Files; gate?: AiGateState; book?: string | null; settings?: Partial<DictionarySettings>; maxInput?: number; shelfDeps?: ConstructorParameters<typeof DictionaryShelf>[1] } = {}) {
    const host = new DomNode();
    const { vault, reads } = vaultOf(options.files ?? standardFiles());
    const shelf = new DictionaryShelf(() => vault as never, options.shelfDeps);
    let gate: AiGateState = options.gate ?? "disabled";
    const requests: { prompt: string; d: ReturnType<typeof deferred> }[] = [];
    const complete = jest.fn((prompt: string) => {
        const d = deferred();
        requests.push({ prompt, d });
        return d.promise;
    });
    const provider = { complete };
    const ai = { gate: () => gate, config: () => ({ enabled: true, endpoint: "http://127.0.0.1:1/v1", apiKey: "x", model: "m", maxInputChars: options.maxInput ?? 12_000 }), getProvider: () => provider };
    const queue = new ReaderAiQueue(() => provider as never);
    let settings: unknown = { ...dictionarySettings(undefined), ...options.settings };
    const view: LookupView = {
        app: {} as never,
        host: () => host as never,
        bookLanguage: () => (options.book === undefined ? "es" : options.book),
        uiLanguage: () => "en",
        settings: () => dictionarySettings(settings),
        saveTranslateInto: jest.fn(async (tag: string) => {
            settings = { ...dictionarySettings(settings), translateInto: tag };
        }),
        queue: () => queue,
    };
    const openSettings = jest.fn();
    const openDocs = jest.fn();
    const copy = jest.fn();
    const lookup = new ReaderLookup(view, { shelf, ai: ai as never, openSettings, openDocs, copy, parse });
    const card = () => host.byClass("reader-lookup-card")[0];
    const body = () => card().oneByClass("reader-lookup-body");
    const buttons = () => card().findAll((el) => el.tag === "button" && !el.hasClass("zettelkasten-flow__reader-hidden") && !el.hasClass("clickable-icon")).map((b) => b.textContent);
    const button = (label: string) => {
        const found = card().find((el) => el.tag === "button" && el.textContent === label);
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    return { host, vault, reads, shelf, lookup, view, card, body, buttons, button, openSettings, openDocs, copy, complete, requests, queue, setGate: (g: AiGateState) => (gate = g), settings: () => dictionarySettings(settings) };
}

const AT = { left: 200, top: 300, width: 40, height: 20 };
let motion: AnimationRecord | null = null;
let undoReduced: (() => void) | null = null;

beforeEach(() => {
    installBrowserGlobals();
});
afterEach(() => {
    motion?.stop();
    motion = null;
    undoReduced?.();
    undoReduced = null;
    jest.useRealTimers();
    jest.restoreAllMocks();
});

async function lookedUp(h: ReturnType<typeof harness>, word: string) {
    await h.lookup.lookUp(word, AT);
    await settle(() => h.card()?.byClass("reader-lookup-entry").length > 0 || h.card()?.byClass("reader-lookup-line").length > 0);
}

describe("the dictionaries, found by name and opened only when asked (#766 FR-2, FR-4, AC-6)", () => {
    it("groups a dictionary's files, loose or in a folder of their own, reading none of them", () => {
        const h = harness({ files: { ...standardFiles(), ...dictionaryFiles("Dictionaries/broken", SPANISH, {}, [".idx"]), "Elsewhere/x.ifo": "x" } });
        const sets = h.shelf.list("Dictionaries");
        expect(sets.map((s) => [s.base, s.dz, s.missing ?? null])).toEqual([
            ["Dictionaries/broken", false, ".idx"],
            ["Dictionaries/es/wiktionary-es", true, null],
            ["Dictionaries/spa-eng", false, null],
        ]);
        expect(h.vault.readBinary).not.toHaveBeenCalled();
    });

    it("reads them on the first look-up, and nothing on the second; never the Adapter, never a write", async () => {
        const h = harness();
        expect(h.reads).toEqual([]);
        await lookedUp(h, "casa");
        const first = [...h.reads];
        expect(first).toEqual(expect.arrayContaining(["Dictionaries/es/wiktionary-es.idx", "Dictionaries/es/wiktionary-es.dict.dz", "Dictionaries/spa-eng.idx", "Dictionaries/spa-eng.dict"]));
        h.lookup.close();
        await lookedUp(h, "correr");
        expect(h.reads).toEqual(first);
        expect(h.vault.create).not.toHaveBeenCalled();
        expect(h.vault.modify).not.toHaveBeenCalled();
        for (const fn of Object.values(h.vault.adapter)) expect(fn).not.toHaveBeenCalled();
    });

    it("reads an .idx.gz, as FreeDict ships its StarDict builds", async () => {
        const built = buildStardict(SPANISH_ENGLISH, { bookname: "FreeDict spa-eng", lang: "es-en", dz: "ra", chunk: 8 });
        const h = harness({ files: { "Dictionaries/spa-eng/spa-eng.ifo": built.ifo, "Dictionaries/spa-eng/spa-eng.idx.gz": dictzip(built.idx, built.idx.length, false), "Dictionaries/spa-eng/spa-eng.dict.dz": built.dict } });
        expect(h.shelf.list("Dictionaries").map((s) => [s.idxGz, s.missing ?? null])).toEqual([[true, null]]);
        await lookedUp(h, "casa");
        expect(h.card().byClass("reader-lookup-entry")[0].textContent).toContain("house; home");
    });

    it("measures what a dictionary holds in memory, not on disk: an .idx.gz is held inflated", async () => {
        const built = buildStardict(SPANISH_ENGLISH, { bookname: "FreeDict spa-eng", lang: "es-en" });
        const asked: number[] = [];
        const h = harness({
            files: { "Dictionaries/d.ifo": built.ifo, "Dictionaries/d.idx.gz": dictzip(built.idx, built.idx.length, false), "Dictionaries/d.dict": built.dict },
            shelfDeps: { tooLarge: (size) => (asked.push(size), false) },
        });
        const [set] = h.shelf.list("Dictionaries");
        const opened = await h.shelf.open(set, { from: "es", to: "en" });
        expect(opened.ok).toBe(true);
        expect(asked.at(-1)).toBe(enc.encode(built.ifo).length + built.idx.length + built.dict.length);
    });

    it("keeps nothing an opening finished after the folder changed", async () => {
        const h = harness();
        const [set] = h.shelf.list("Dictionaries").filter((s) => s.base.endsWith("spa-eng"));
        const run = h.shelf.open(set, { from: "es", to: "en" });
        h.shelf.forget();
        expect((await run).ok).toBe(true);
        expect(h.shelf.isOpen(set)).toBe(false);
    });

    it("has no method that writes, moves or downloads (structural)", () => {
        const names = Object.getOwnPropertyNames(DictionaryShelf.prototype);
        expect(names.filter((name) => /write|save|create|modify|rename|delete|remove|download|fetch/i.test(name))).toEqual([]);
    });

    it("refuses a dictionary too large for the device before reading it, and the others still answer", async () => {
        const h = harness({ shelfDeps: { tooLarge: (size) => size > 200 } });
        await lookedUp(h, "casa");
        const entries = h.card().byClass("reader-lookup-entry");
        expect(entries.map((e) => e.oneByClass("reader-lookup-source").textContent)).toEqual(["FreeDict spa-engTranslation", "Wiktionary (Spanish)"]);
        expect(entries[1].textContent).toContain("This dictionary is too large to open on this device");
        expect(h.reads.some((path) => path.startsWith("Dictionaries/es/wiktionary-es.") && !path.endsWith(".ifo"))).toBe(false);
    });
});

describe("the card (#766 FR-7, AC-3, AC-5)", () => {
    it("shows the headword and each answer under its dictionary's name: monolingual, then the translation", async () => {
        const h = harness();
        await lookedUp(h, "Casa,");
        expect(h.card().oneByClass("reader-lookup-word").textContent).toBe("Casa");
        const entries = h.card().byClass("reader-lookup-entry");
        expect(entries.map((e) => e.oneByClass("reader-lookup-source").textContent)).toEqual(["Wiktionary (Spanish)", "FreeDict spa-engTranslation"]);
        // The HTML entry, rebuilt: its emphasis and its list, never its script.
        const def = entries[0].oneByClass("reader-lookup-def");
        expect(def.find((el) => el.tag === "b")?.textContent).toBe("casa");
        expect(def.find((el) => el.tag === "li")?.textContent).toBe("hogar");
        expect(def.find((el) => el.tag === "script")).toBeUndefined();
        expect(def.textContent).not.toContain("alert");
        expect(entries[1].textContent).toContain("house; home");
        expect(h.card().oneByClass("reader-lookup-byline").textContent).toBe("From your dictionaries, on this device");
    });

    it("finds an inflected form through the synonyms, and names the headword it led to", async () => {
        const h = harness();
        await lookedUp(h, "corrió");
        const entry = h.card().byClass("reader-lookup-entry")[0];
        expect(entry.oneByClass("reader-lookup-headword").textContent).toBe("correr");
        expect(entry.textContent).toContain("Ir deprisa.");
    });

    it("never builds with innerHTML", async () => {
        const h = harness();
        const proto = DomNode.prototype as any;
        const set = jest.fn();
        Object.defineProperty(proto, "innerHTML", { set, configurable: true });
        proto.insertAdjacentHTML = jest.fn();
        try {
            await lookedUp(h, "casa");
            expect(set).not.toHaveBeenCalled();
            expect(proto.insertAdjacentHTML).not.toHaveBeenCalled();
        } finally {
            delete proto.innerHTML;
            delete proto.insertAdjacentHTML;
        }
    });

    it("copies the answers on a click", async () => {
        const h = harness();
        await lookedUp(h, "casa");
        h.button("Copy").click();
        const copied = (h.copy.mock.calls[0] as [string])[0];
        expect(copied.startsWith("casa\n\nWiktionary (Spanish)\n")).toBe(true);
        expect(copied).toContain("house; home");
    });

    it("makes no network call, with AI on or off (AC-5)", async () => {
        for (const gate of ["disabled", "ready"] as const) {
            const h = harness({ gate });
            const requestUrl = jest.fn(async () => ({ status: 200, json: {} }));
            __setRequestUrl(requestUrl);
            const g = globalThis as any;
            const hadFetch = "fetch" in g;
            const before = g.fetch;
            g.fetch = jest.fn();
            try {
                await lookedUp(h, "casa");
                expect(requestUrl).not.toHaveBeenCalled();
                expect(g.fetch).not.toHaveBeenCalled();
                expect(h.complete).not.toHaveBeenCalled();
            } finally {
                if (hadFetch) g.fetch = before;
                else delete g.fetch;
            }
        }
    });

    it("keeps the look-up path off the network by construction (structural)", () => {
        const src = join(__dirname, "..", "..", "..", "..", "..", "src");
        const stardict = join(src, "application", "library", "stardict");
        const files = [...readdirSync(stardict).map((f) => join(stardict, f)), join(src, "architecture", "plugin", "library", "DictionaryShelf.ts")];
        for (const file of files) {
            const code = readFileSync(file, "utf8");
            expect({ file, ai: /architecture\/ai/.test(code), request: /requestUrl/.test(code), fetch: /\bfetch\(/.test(code) }).toEqual({ file, ai: false, request: false, fetch: false });
        }
        const card = readFileSync(join(src, "architecture", "components", "core", "reader", "readerLookup.ts"), "utf8");
        expect(/requestUrl|\bfetch\(/.test(card)).toBe(false);
    });
});

describe("the empty states, honest and short (#766 FR-8, AC-8)", () => {
    it("says where to put dictionaries when there are none, with its two links", async () => {
        const h = harness({ files: { "Notes/a.md": "x" } });
        await lookedUp(h, "casa");
        expect(h.body().textContent).toContain("No dictionaries yet: add StarDict dictionaries to your dictionaries folder");
        expect(h.buttons()).toEqual(["Open settings", "Where to find free dictionaries"]);
        h.button("Where to find free dictionaries").click();
        expect(h.openDocs).toHaveBeenCalledWith(DICTIONARIES_DOCS_URL);
        h.button("Open settings").click();
        expect(h.openSettings).toHaveBeenCalledWith({}, "reading");
        expect(h.lookup.hasCards()).toBe(false);
    });

    it("an incomplete set is not a dictionary to look up in", async () => {
        const h = harness({ files: dictionaryFiles("Dictionaries/x", SPANISH, { lang: "es" }, [".dict"]) });
        await lookedUp(h, "casa");
        expect(h.body().textContent).toContain("No dictionaries yet");
    });

    it("names the book's language when no dictionary is for it", async () => {
        const h = harness({ book: "de-DE" });
        await lookedUp(h, "Haus");
        expect(h.body().textContent).toContain("No dictionary for German in your dictionaries folder");
        expect(h.buttons()).toEqual(["Open settings", "Where to find free dictionaries"]);
    });

    it("names every dictionary it asked when none has the word", async () => {
        const h = harness();
        await lookedUp(h, "zzz");
        expect(h.body().textContent).toBe('No entry for "zzz" in Wiktionary (Spanish) and FreeDict spa-eng');
    });

    it("uses the two saved fields for a dictionary that declares no languages", async () => {
        const files = dictionaryFiles("Dictionaries/plain", SPANISH_ENGLISH, { bookname: "Plain" });
        const none = harness({ files });
        await lookedUp(none, "casa");
        expect(none.body().textContent).toContain("No dictionary for Spanish");
        const set = harness({ files, settings: { languages: { "Dictionaries/plain": { from: "es", to: "en" } } } });
        await lookedUp(set, "casa");
        expect(set.card().byClass("reader-lookup-entry")[0].textContent).toContain("house; home");
    });
});

describe("no waiting room (#766 FR-13)", () => {
    it("says Opening … only after 150 ms, as text, in the same box", async () => {
        jest.useFakeTimers();
        const h = harness();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const realOpen = h.shelf.open.bind(h.shelf);
        jest.spyOn(h.shelf, "open").mockImplementation(async (set, languages) => {
            await gate;
            return realOpen(set, languages);
        });
        const run = h.lookup.lookUp("casa", AT);
        for (let i = 0; i < 10; i++) await Promise.resolve();
        const box = h.body();
        jest.advanceTimersByTime(OPENING_MS - 10);
        expect(box.textContent).toBe("");
        jest.advanceTimersByTime(20);
        expect(box.textContent).toBe("Opening Wiktionary (Spanish) and FreeDict spa-eng…");
        expect(box.byClass("reader-ink-wait")).toHaveLength(0);
        release();
        for (let i = 0; i < 40; i++) await Promise.resolve();
        // It stays a moment once said, then the entry takes its place.
        jest.advanceTimersByTime(OPENING_DWELL_MS - 50);
        for (let i = 0; i < 40; i++) await Promise.resolve();
        expect(box.textContent).toContain("Opening");
        jest.advanceTimersByTime(100);
        jest.useRealTimers();
        await run;
        expect(h.body()).toBe(box);
        expect(box.byClass("reader-lookup-entry")).toHaveLength(2);
    });

    it("answers at once from an opened dictionary: nothing says Opening", async () => {
        jest.useFakeTimers();
        const h = harness();
        jest.useRealTimers();
        await lookedUp(h, "casa");
        h.lookup.close();
        jest.useFakeTimers();
        const run = h.lookup.lookUp("correr", AT);
        jest.advanceTimersByTime(OPENING_MS * 2);
        jest.useRealTimers();
        await run;
        expect(h.body().textContent).not.toContain("Opening");
    });
});

describe("the motion (#766 FR-12, FR-15, AC-11)", () => {
    it("grows from the words — scale .96 to 1 and a fade, the fast beat, its origin the selection's centre — and closes in reverse", async () => {
        motion = recordAnimations();
        const h = harness();
        await lookedUp(h, "casa");
        const card = h.card();
        const grow = motion.animations.find((a) => a.target === card)!;
        expect(grow.keyframes).toEqual([
            { transform: "scale(0.96)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
        ]);
        expect(grow.options.duration).toBe(MOTION.fast);
        // The host and the card measure 100 × 100 at 0,0 here: the words' centre is at 220.
        const x = Number(card.cssProps["--zf-lookup-x"].replace("px", ""));
        expect(Number(card.cssProps["--zf-origin-x"].replace("px", "")) + x).toBe(220);
        h.lookup.close();
        const back = motion.animations.filter((a) => a.target === card).pop()!;
        expect(back.keyframes).toEqual([
            { transform: "scale(1)", opacity: 1 },
            { transform: "scale(0.96)", opacity: 0 },
        ]);
        back.finish();
        expect(h.host.byClass("reader-lookup-card")).toHaveLength(0);
    });

    it("appears and goes at once under reduced motion", async () => {
        motion = recordAnimations();
        undoReduced = reducedMotion(true);
        const h = harness();
        await lookedUp(h, "casa");
        expect(motion.animations).toHaveLength(0);
        h.lookup.close();
        expect(h.host.byClass("reader-lookup-card")).toHaveLength(0);
    });

    it("is the newest card for Esc, and goes with no trace", async () => {
        const h = harness();
        await lookedUp(h, "casa");
        expect(h.lookup.hasCards()).toBe(true);
        expect(dismissNewestOf([null, h.lookup])).toBe(true);
        expect(h.lookup.hasCards()).toBe(false);
        expect(h.host.byClass("reader-lookup-card")).toHaveLength(0);
    });
});

describe("Translate, where an honest path exists (#766 FR-9, FR-14, AC-9)", () => {
    const PASSAGE = "Era una casa vieja. La lluvia no paraba.";

    it("is hidden while AI is off, and offered up to the AI input cap while it is on", () => {
        expect(harness({ gate: "disabled" }).lookup.offers(PASSAGE).translate).toBe(false);
        expect(harness({ gate: "unconfigured" }).lookup.offers(PASSAGE).translate).toBe(true);
        const ready = harness({ gate: "ready", maxInput: 600 });
        expect(ready.lookup.offers(PASSAGE).translate).toBe(true);
        expect(ready.lookup.offers("x".repeat(601)).translate).toBe(false);
        expect(ready.lookup.offers(PASSAGE).lookUp).toBe(false);
        expect(ready.lookup.offers("casa").lookUp).toBe(true);
    });

    it("is the system's on iPhone and iPad: ours is hidden, Look up is offered", () => {
        withPlatform(IPAD, () => {
            const h = harness({ gate: "ready" });
            expect(h.lookup.offers("casa")).toEqual({ lookUp: true, translate: false });
            h.lookup.translate(PASSAGE, AT);
            expect(h.complete).not.toHaveBeenCalled();
        });
    });

    it("is like desktop on Android", () => {
        withPlatform({ isMobile: true, isAndroidApp: true, isDesktop: false, isDesktopApp: false }, () => {
            expect(harness({ gate: "ready" }).lookup.offers(PASSAGE).translate).toBe(true);
        });
    });

    it("says the provider is not set up, and sends nothing", () => {
        const h = harness({ gate: "unconfigured", book: "es" });
        h.lookup.translate(PASSAGE, AT);
        expect(h.body().oneByClass("reader-lookup-line").textContent).toBe("Your AI provider isn't set up yet");
        h.button("Open AI settings").click();
        expect(h.openSettings).toHaveBeenCalledWith({}, "ai");
        expect(h.complete).not.toHaveBeenCalled();
    });

    it("sends one request per click — the passage and the target only — and the ink waits for it", async () => {
        motion = recordAnimations();
        const h = harness({ gate: "ready" });
        h.lookup.translate(PASSAGE, AT);
        expect(h.complete).toHaveBeenCalledTimes(1);
        const prompt = (h.complete.mock.calls[0] as [string])[0];
        expect(prompt).toContain("Translate the passage into English: a faithful translation, with no commentary");
        expect(prompt).toContain(`<note-content>\nPassage: ${PASSAGE}\n</note-content>`);
        // The same passage clicked again while it waits: nothing more.
        h.lookup.translate(PASSAGE, AT);
        expect(h.complete).toHaveBeenCalledTimes(1);
        const box = h.body();
        expect(box.byClass("reader-ink-wait")[0].children).toHaveLength(3);
        expect(h.card().oneByClass("reader-lookup-byline").textContent).toBe("Sent to your AI provider, on your click");
        h.requests[0].d.resolve("It was an old house. The rain would not stop.");
        await flush();
        expect(h.body()).toBe(box);
        expect(box.byClass("reader-ink-wait")).toHaveLength(0);
        expect(box.oneByClass("reader-lookup-translation").textContent).toBe("It was an old house. The rain would not stop.");
        const fade = motion.animations.filter((a) => a.target === box).pop()!;
        expect(fade.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
        expect(fade.options.duration).toBe(MOTION.fast);
        h.button("Copy").click();
        expect(h.copy).toHaveBeenCalledWith("It was an old house. The rain would not stop.");
    });

    it("offers Try again on a timeout, and never retries by itself", async () => {
        const h = harness({ gate: "ready" });
        h.lookup.translate(PASSAGE, AT);
        h.requests[0].d.reject(new Error("request timed out"));
        await flush();
        expect(h.body().textContent).toContain("Your AI provider didn't answer.");
        expect(h.complete).toHaveBeenCalledTimes(1);
        h.button("Try again").click();
        expect(h.complete).toHaveBeenCalledTimes(2);
    });

    it("asks which language when the target is the book's own, and keeps the choice", async () => {
        const h = harness({ gate: "ready", book: "en-GB" });
        h.lookup.translate("It was an old house.", AT);
        expect(h.complete).not.toHaveBeenCalled();
        expect(h.body().textContent).toContain("Translate into which language?");
        const select = h.card().find((el) => el.tag === "select")!;
        expect(select.findAll((el) => el.tag === "option").map((o) => o.getAttribute("value"))).not.toContain("en");
        select.value = "es";
        h.button("Translate").click();
        expect(h.view.saveTranslateInto).toHaveBeenCalledWith("es");
        expect(h.settings().translateInto).toBe("es");
        expect((h.complete.mock.calls[0] as [string])[0]).toContain("into Spanish");
    });

    it("closing the card discards what comes back", async () => {
        const h = harness({ gate: "ready" });
        h.lookup.translate(PASSAGE, AT);
        h.lookup.close();
        h.requests[0].d.resolve("late");
        await flush();
        expect(h.host.byClass("reader-lookup-card")).toHaveLength(0);
        expect(h.queue.has(`translate:en:${PASSAGE}`)).toBe(false);
    });
});

describe("Look up and Translate in the popover's last row (#766 FR-1, FR-10)", () => {
    function chapter(): FakeEl {
        return new FakeEl("div", [new FakeEl("p", ["Era una casa vieja y la lluvia no paraba nunca en el pueblo."])]);
    }
    function mount(offer: { lookUp: boolean; translate: boolean }, onDoc = false) {
        const body = chapter() as FakeEl & { ownerDocument?: unknown; contains?: (n: unknown) => boolean };
        const doc = new DomNode();
        if (onDoc) {
            body.ownerDocument = doc;
            body.contains = (n) => n === body;
        }
        const host = new DomNode();
        let selection: SelectionInfo | null = null;
        const actions: LookupActions = { offers: jest.fn(() => offer), lookUp: jest.fn(), translate: jest.fn() };
        const store = { folder: () => "Lab", highlightsAbout: jest.fn(async () => []), write: jest.fn(), save: jest.fn(), discard: jest.fn(), restore: jest.fn() };
        const highlights = new ReaderHighlights(
            { app: {} as never, host: host as never, owner: new Component(), scrollTo: jest.fn(), onChange: jest.fn(), lookup: () => actions },
            { store: store as unknown as HighlightStore, selection: () => selection, headingAt: () => undefined, copy: jest.fn() }
        );
        const clear = jest.fn();
        const select = (words: string) => {
            const start = chapterText(body as never).indexOf(words);
            selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30, height: 18 }, clear };
        };
        const row = () => host.byClass("reader-hl-actions")[0];
        return { highlights, host, body, doc, select, row, actions, clear };
    }

    it("puts Look up and Translate after Copy, and opens the card from the words", async () => {
        const m = mount({ lookUp: true, translate: true });
        await m.highlights.attach(m.body as never, "Books/x.epub", new Component(), null);
        m.select("casa");
        m.body.fire("mouseup");
        const labels = m.row().findAll((el) => el.tag === "button").map((b) => b.textContent);
        expect(labels.slice(-3)).toEqual(["Copy", "Look up", "Translate"]);
        m.row().find((el) => el.textContent === "Look up")!.click();
        expect(m.highlights.hasPopover()).toBe(false);
        expect(m.actions.lookUp).toHaveBeenCalledWith("casa", { left: 10, top: 20, width: 30, height: 18 });
        expect(m.clear).toHaveBeenCalled();
    });

    it("offers neither where the view says so", async () => {
        const m = mount({ lookUp: false, translate: false });
        await m.highlights.attach(m.body as never, "Books/x.epub", new Component(), null);
        m.select("Era una casa vieja y la lluvia");
        m.body.fire("mouseup");
        const labels = m.row().findAll((el) => el.tag === "button").map((b) => b.textContent);
        expect(labels).not.toContain("Look up");
        expect(labels).not.toContain("Translate");
    });

    it("on a touch selection, holds Look up with no Copy of ours (the system's callout has its own)", async () => {
        jest.useFakeTimers();
        const m = mount({ lookUp: true, translate: false }, true);
        await m.highlights.attach(m.body as never, "Books/x.epub", new Component(), null);
        m.doc.fire("pointerdown", { pointerType: "touch" });
        m.select("casa");
        m.doc.fire("selectionchange");
        jest.advanceTimersByTime(1_000);
        const labels = m.row().findAll((el) => el.tag === "button").map((b) => b.textContent);
        expect(labels).toContain("Look up");
        expect(labels).not.toContain("Copy");
    });
});

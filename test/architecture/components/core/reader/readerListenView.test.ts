/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { Menu, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { place } from "../../../../support/readerPlace";
import { press } from "../../../../support/readerKeys";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { withPlatform, IPAD } from "../../../../support/platform";
import { FakeSpeech, fakeSpeechPort } from "../../../../support/fakeSpeech";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { SURVIVED_MIN_MS } from "architecture/components/core/reader/readerSurvived";
import { ListenSession, type ListenView } from "architecture/components/core/reader/readerListenSession";
import { LISTEN_STORAGE_KEY } from "architecture/components/core/reader/readerListen";
import type { HighlightStore, SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import type { Thought } from "application/thinking/thought";

/**
 * **Listen** over a mounted Reader (#765 AC-3 – AC-8): the book read aloud by a fake speech engine,
 * sentence by sentence; the page following; a mark kept while the voice goes on; nothing else written.
 */

const g = globalThis as any;
const PATH = "Books/middlemarch.epub";
const cls = (name: string) => `zettelkasten-flow__${name}`;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const WORDS = Array.from({ length: 300 }, (_, i) => `word${i % 7 === 0 ? "s" : ""}`).join(" ");
/** Four chapters of three paragraphs, each of three sentences and three hundred words: real chapters. */
const BOOK = makeEpub({
    title: "Middlemarch",
    chapters: [1, 2, 3, 4].map((n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: ["Prelude", "Miss Brooke", "Old and young", "Waiting for death"][n - 1],
        body: Array.from({ length: 3 }, (_, i) => `<p>Chapter ${n} paragraph ${i} begins. Then ${WORDS} go on. It ends ${i}.</p>`).join(""),
    })),
});
const SENTENCES_PER_CHAPTER = 9;

const STAGE = { left: 0, top: 0, width: 1000, height: 700 };

function mark(id: string, chapter: number): Thought {
    return {
        id,
        at: 1,
        text: "",
        links: [],
        about: PATH,
        quote: { exact: `Chapter ${chapter + 1} paragraph 1`, prefix: "", suffix: "" },
        locator: { at: chapter, label: `Chapter ${chapter + 1}`, chapter: `text/ch${chapter + 1}.xhtml` },
        meaning: "idea",
    } as Thought;
}

let now = 1_000_000;
/** Every Reader a test opened: closed after it, so no voice's watchdog outlives the test. */
const opened: ReaderView[] = [];

function mount(thoughts: Thought[], options: { speech?: FakeSpeech | null; stored?: unknown } = {}) {
    const book = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
        readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength),
        cachedRead: async () => "",
        getMarkdownFiles: () => [],
        modify: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
    };
    const local = new Map<string, unknown>(options.stored ? [[LISTEN_STORAGE_KEY, options.stored]] : []);
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
        loadLocalStorage: jest.fn((key: string) => local.get(key) ?? null),
        saveLocalStorage: jest.fn((key: string, value: unknown) => local.set(key, value)),
    };
    const content = new DomNode();
    // The document the Reader is in: its visibility is what an iPad's lock changes.
    const doc = new DomNode() as any;
    doc.visibilityState = "visible";
    (content as any).doc = doc;
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "leaf" }, readerPrefs: { font: "sans", size: "medium", theme: "auto" } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const write = jest.fn(async (text: string, fields: Record<string, unknown>) => ({ id: `m${write.mock.calls.length}`, at: 2, text, links: [], ...fields }) as unknown as Thought);
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: write as any,
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    let selection: SelectionInfo | null = null;
    const speech = options.speech === undefined ? new FakeSpeech() : options.speech;
    const view = new ReaderView(leaf, host, { store, toNote: jest.fn(), selection: () => selection, headingAt: () => undefined, copy: jest.fn() } as any, {}, {}, {}, {}, {}, {}, {}, {
        speech: speech ? fakeSpeechPort(speech) : null,
    });
    opened.push(view);
    const select = (span: { start: number; end: number } | null) => {
        selection = span ? { ...span, rect: { left: 10, top: 20, width: 30, height: 18 }, clear: jest.fn() } : null;
    };
    return { view, content, host, store, vault, speech: speech as FakeSpeech, app, write, select, doc };
}

/** The stage's box, and every paragraph a row of 200 px from the top of the chapter, as it scrolls. */
function layOut(content: DomNode) {
    const stage = content.oneByClass("reader-stage") as any;
    stage.clientHeight = STAGE.height;
    Object.defineProperty(stage, "scrollHeight", { configurable: true, get: () => 3000 });
    const proto = DomNode.prototype as any;
    const plain = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this === stage) return { ...STAGE };
        if (this.tag === "p") {
            const body = this.parent;
            const i = body ? body.children.filter((child) => child.tag === "p").indexOf(this) : 0;
            return { left: 100, top: 100 + i * 250 - stage.scrollTop, width: 700, height: 200 };
        }
        return { left: 100, top: 0, width: 700, height: 200 };
    };
    return { stage, restore: () => (proto.getBoundingClientRect = plain) };
}

const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const count = (content: DomNode) => place(content);
const body = (content: DomNode) => livePage(content)!.oneByClass("reader-body");
const paragraphs = (content: DomNode) => body(content).findAll((el) => el.tag === "p");
const tinted = (content: DomNode) => paragraphs(content).findIndex((p) => p.hasClass(cls("reader-listen-now")));
const leafOn = (content: DomNode) => (livePage(content)?.byClass("reader-survived").length ?? 0) > 0;
const listenButton = (content: DomNode) => content.find((el) => el.getAttribute("data-zf-listen") !== null && el.tag === "button");
const bar = (content: DomNode) => content.byClass("reader-listen-bar")[0];
const barButton = (content: DomNode, label: string) => bar(content)?.find((el) => el.tag === "button" && (el.getAttribute("aria-label") === label || el.textContent === label));
/** The bar sinks away: its last animation played to its end, and it is gone. */
function barGone(content: DomNode, rec: AnimationRecord): boolean {
    const el = bar(content);
    if (!el) return true;
    rec.animations.filter((a) => a.target === el).at(-1)?.finish();
    return !bar(content);
}
async function drawn(content: DomNode, chapter: number) {
    await settle(() => count(content) === `Chapter ${chapter} / 4` && (livePage(content)?.byClass("reader-next").length ?? 0) > 0);
}

describe("listen, over the Reader (#765)", () => {
    let undoText: () => void;
    let rec: AnimationRecord;
    let motion: () => void;
    let restore: (() => void) | null = null;
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        undoText = withTextNodes();
    });
    afterAll(() => {
        delete g.DOMParser;
        undoText();
    });
    beforeEach(() => {
        g.addEventListener ??= () => undefined;
        g.removeEventListener ??= () => undefined;
        // The ghost a new highlight flies into the margin with is made unattached, as Obsidian's global does.
        g.createDiv = (options: unknown) => {
            const el = new DomNode().createDiv(options);
            el.remove();
            return el;
        };
        resetReaderWorkspace();
        rec = recordAnimations();
        motion = reducedMotion(false);
        now = 1_000_000;
        jest.spyOn(Date, "now").mockImplementation(() => now);
        (Menu as any).last = null;
    });
    afterEach(async () => {
        for (const view of opened.splice(0)) await view.onClose();
        endChapterTurn();
        restore?.();
        restore = null;
        rec.stop();
        motion();
        jest.restoreAllMocks();
    });

    async function open(thoughts: Thought[] = [], options: Parameters<typeof mount>[1] = {}, chapter = 0) {
        const m = mount(thoughts, options);
        await m.view.setState({ source: PATH, chapter }, {} as never);
        await m.view.onOpen();
        await drawn(m.content, chapter + 1);
        const laid = layOut(m.content);
        restore = laid.restore;
        await settle(() => (m.store.highlightsAbout as jest.Mock).mock.calls.length >= 2);
        await Promise.resolve();
        return { ...m, ...laid };
    }

    function listen(m: { content: DomNode }, item: "From here" | "This chapter") {
        listenButton(m.content)!.click({});
        (Menu as any).last.item(item).click();
    }

    /** The voice reads on to the end of the chapter on the page. */
    function hearChapter(m: { speech: FakeSpeech }, sentences = SENTENCES_PER_CHAPTER) {
        for (let i = 0; i < sentences; i++) m.speech.endCurrent();
    }

    it("From here reads the paragraph at the top of the page, tinted, with the bar at the foot (AC-3, AC-4)", async () => {
        const m = await open();
        expect(listenButton(m.content)!.hasClass(cls("reader-hidden"))).toBe(false);
        listen(m, "From here");
        expect(m.speech.text).toBe("Chapter 1 paragraph 0 begins.");
        expect(m.speech.speaking!.voice?.name).toBe("Hazel");
        expect(tinted(m.content)).toBe(0);
        expect(bar(m.content)).toBeDefined();
        expect((m.view as any).listening).toBe(true);
        m.speech.endCurrent();
        expect(m.speech.text?.startsWith("Then word")).toBe(true);
        m.speech.endCurrent();
        m.speech.endCurrent();
        // The next paragraph: the tint moves with the voice.
        expect(m.speech.text).toBe("Chapter 1 paragraph 1 begins.");
        expect(tinted(m.content)).toBe(1);
        expect(paragraphs(m.content)[0].hasClass(cls("reader-listen-now"))).toBe(false);
    });

    it("From here begins at the paragraph you last tapped, while it is on screen (FR-1)", async () => {
        const m = await open();
        const second = paragraphs(m.content)[1];
        m.stage.fire("click", { target: second.children[0] });
        listen(m, "From here");
        expect(m.speech.text).toBe("Chapter 1 paragraph 1 begins.");
    });

    it("turns the chapter at its end by the reader's own turn — no What survived? — and the voice goes on as it lands (AC-3, FR-12)", async () => {
        const m = await open([mark("h1", 0)]);
        now += SURVIVED_MIN_MS + 1000;
        listen(m, "From here");
        const played = rec.animations.length;
        hearChapter(m);
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
        // The chapter turned by its motion; the voice waits for it to land.
        expect(rec.animations.length).toBeGreaterThan(played);
        expect(m.speech.text).toBeNull();
        await settle(() => m.speech.text !== null, 400, 2000);
        expect(m.speech.text).toBe("Chapter 2 paragraph 0 begins.");
        expect(tinted(m.content)).toBe(0);
    });

    it("goes on at once under reduced motion, and This chapter stops at the chapter's end (AC-3, FR-15)", async () => {
        motion();
        motion = reducedMotion(true);
        const m = await open();
        listen(m, "From here");
        hearChapter(m);
        await drawn(m.content, 2);
        await settle(() => m.speech.text !== null);
        expect(m.speech.text).toBe("Chapter 2 paragraph 0 begins.");
        listen(m, "This chapter");
        expect(m.speech.text).toBe("Chapter 2 paragraph 0 begins.");
        hearChapter(m);
        await settle(() => !bar(m.content));
        expect(m.speech.text).toBeNull();
        expect(count(m.content)).toBe("Chapter 2 / 4");
        expect((m.view as any).listening).toBe(false);
        expect(bar(m.content)).toBeUndefined();
    });

    it("Read aloud reads the selected words only, then stops (AC-3)", async () => {
        const m = await open();
        const text = chapterText(body(m.content) as any);
        const start = text.indexOf("It ends 0.");
        m.select({ start, end: text.indexOf("Then", text.indexOf("paragraph 1")) });
        body(m.content).fire("mouseup");
        const aloud = m.content.find((el) => el.getAttribute("data-zf-listen") !== null && el.tag === "button" && el.textContent === "Read aloud");
        expect(aloud).toBeDefined();
        aloud!.click({});
        expect(m.speech.text).toBe("It ends 0.");
        m.speech.endCurrent();
        expect(m.speech.text).toBe("Chapter 1 paragraph 1 begins.");
        m.speech.endCurrent();
        expect(m.speech.text).toBeNull();
        expect(barGone(m.content, rec)).toBe(true);
    });

    it("scrolls only when the paragraph read nears the bottom, once; a scroll of yours stops it until Back to the voice (AC-4, FR-14)", async () => {
        const m = await open();
        listen(m, "From here");
        // Paragraphs 0 and 1 end at 300 and 550 of a 700 px view: no move.
        hearChapter(m, 3);
        expect(m.stage.scrolls.filter((s: any) => s && "top" in s)).toEqual([]);
        // Paragraph 2 ends at 800: past 85 % — one smooth move bringing it to the upper third.
        hearChapter(m, 3);
        const moves = () => m.stage.scrolls.filter((s: any) => s && "top" in s);
        expect(moves()).toEqual([{ top: Math.round(600 - 700 / 3), behavior: "smooth" }]);
        m.speech.endCurrent();
        expect(moves()).toHaveLength(1);
        // A wheel of yours: the page stops following, and the bar offers the way back.
        m.stage.fire("wheel", {});
        expect(barButton(m.content, "Back to the voice")!.hasClass(cls("reader-hidden"))).toBe(false);
        barButton(m.content, "Back to the voice")!.click({});
        expect(moves()).toHaveLength(2);
        expect(barButton(m.content, "Back to the voice")!.hasClass(cls("reader-hidden"))).toBe(true);
    });

    it("Mark and H keep the sentence being read with the last meaning and the current layer; the voice goes on (AC-5)", async () => {
        const m = await open();
        jest.spyOn(m.view as any, "layerTarget").mockReturnValue("research");
        listen(m, "From here");
        m.speech.endCurrent();
        const heard = m.speech.text!;
        const cancels = m.speech.cancels.length;
        barButton(m.content, "Mark")!.click({});
        await settle(() => m.write.mock.calls.length === 1);
        const fields = m.write.mock.calls[0][1] as any;
        expect(fields.quote.exact).toBe(heard);
        expect(fields.meaning).toBe("idea");
        expect(fields.layer).toBe("research");
        expect(m.speech.cancels.length).toBe(cancels);
        expect(m.speech.text).toBe(heard);
        // The marker's sweep, as a highlight by hand has.
        await settle(() => body(m.content).byClass("reader-highlight--new").length > 0);
        expect(body(m.content).byClass("reader-highlight--new").length).toBeGreaterThan(0);
        // H, with nothing selected, keeps the next one.
        m.speech.endCurrent();
        const evt = press({ view: m.view } as any, "H");
        expect(evt.defaultPrevented).toBe(true);
        await settle(() => m.write.mock.calls.length === 2);
        expect((m.write.mock.calls[1][1] as any).quote.exact).toBe(m.speech.text);
    });

    it("H with nothing selected and not listening does nothing, as today", async () => {
        const m = await open();
        const evt = press({ view: m.view } as any, "H");
        expect(evt.defaultPrevented).toBe(false);
        expect(m.write).not.toHaveBeenCalled();
    });

    it("listening a chapter through without Mark writes nothing (FR-9)", async () => {
        const m = await open();
        listen(m, "This chapter");
        hearChapter(m);
        expect(m.write).not.toHaveBeenCalled();
        expect(m.vault.modify).not.toHaveBeenCalled();
        expect(m.vault.create).not.toHaveBeenCalled();
        expect(m.vault.process).not.toHaveBeenCalled();
    });

    it("a hidden page on an iPad pauses at its sentence; play reads that sentence again (AC-6)", async () => {
        const m = await open();
        listen(m, "From here");
        m.speech.endCurrent();
        const heard = m.speech.text;
        // On a desktop a covered window is "hidden" too, and the voice goes on (found in the walk).
        m.doc.visibilityState = "hidden";
        m.doc.fire("visibilitychange");
        expect(m.speech.text).toBe(heard);
        m.doc.visibilityState = "visible";
        // On an iPad the web view stops the voice: listening is paused at its sentence.
        withPlatform(IPAD, () => {
            m.doc.visibilityState = "hidden";
            m.doc.fire("visibilitychange");
        });
        expect(m.speech.text).toBeNull();
        expect(barButton(m.content, "Play")).toBeDefined();
        barButton(m.content, "Play")!.click({});
        expect(m.speech.text).toBe(heard);
    });

    it("K, [ and ] drive the voice while listening; Esc stops it first; otherwise they are the app's (FR-10)", async () => {
        const m = await open();
        expect(press({ view: m.view } as any, "K").defaultPrevented).toBe(false);
        listen(m, "From here");
        press({ view: m.view } as any, "]");
        expect(m.speech.text?.startsWith("Then word")).toBe(true);
        press({ view: m.view } as any, "[");
        expect(m.speech.text).toBe("Chapter 1 paragraph 0 begins.");
        press({ view: m.view } as any, "K");
        expect(m.speech.text).toBeNull();
        press({ view: m.view } as any, "K");
        expect(m.speech.text).toBe("Chapter 1 paragraph 0 begins.");
        press({ view: m.view } as any, "Escape");
        expect(m.speech.text).toBeNull();
        expect(barGone(m.content, rec)).toBe(true);
    });

    it("the shortcuts sheet names the listening bar's keys (FR-10)", async () => {
        const m = await open();
        press({ view: m.view } as any, "?");
        const sheet = m.content.oneByClass("reader-shortcuts").textContent;
        for (const label of ["Pause or play while listening", "Previous or next sentence while listening", "Mark the sentence being read"]) expect(sheet).toContain(label);
    });

    it("offers the device's voices in the menu and the bar, keeps the voice and the speed on this device", async () => {
        const remote = FakeSpeech.voice({ name: "Cloud", localService: false, default: true });
        const hazel = FakeSpeech.voice({ name: "Hazel", default: false });
        const george = FakeSpeech.voice({ name: "George", default: false });
        const m = await open([], { speech: new FakeSpeech([remote, hazel, george]), stored: { voice: "George", rate: 1.5 } });
        listenButton(m.content)!.click({});
        const titles = (Menu as any).last.items.map((item: any) => item.title);
        expect(titles).toEqual(["From here", "This chapter", "Voice", "Hazel (default)", "George"]);
        expect(titles).not.toContain("Cloud");
        (Menu as any).last.item("From here").click();
        expect(m.speech.speaking!.voice?.name).toBe("George");
        expect(m.speech.speaking!.rate).toBe(1.5);
        const rate = bar(m.content)!.oneByClass("reader-listen-rate") as any;
        expect(rate.children.map((o: DomNode) => o.textContent)).toEqual(["0.75×", "1×", "1.25×", "1.5×", "1.75×", "2×"]);
        rate.value = "2";
        rate.fire("change");
        expect(m.app.saveLocalStorage).toHaveBeenCalledWith(LISTEN_STORAGE_KEY, { voice: "George", rate: 2 });
        expect(m.speech.speaking!.rate).toBe(2);
        const voice = bar(m.content)!.oneByClass("reader-listen-voice") as any;
        expect(voice.children.map((o: DomNode) => o.textContent)).toEqual(["Hazel (default)", "George"]);
        // The default one forgets your choice: the voice follows each book's language again (#863).
        voice.value = hazel.voiceURI;
        voice.fire("change");
        expect(m.app.saveLocalStorage).toHaveBeenLastCalledWith(LISTEN_STORAGE_KEY, { voice: undefined, rate: 2 });
        expect(m.speech.speaking!.voice?.name).toBe("Hazel");
    });

    it("keeps other languages' voices behind Other languages…, found by name or language (#863)", async () => {
        const hazel = FakeSpeech.voice({ name: "Hazel", lang: "en-GB", default: true });
        const eddyEn = FakeSpeech.voice({ name: "Eddy", voiceURI: "eddy-en", lang: "en-US", default: false });
        const eddyFr = FakeSpeech.voice({ name: "Eddy", voiceURI: "eddy-fr", lang: "fr-FR", default: false });
        const eddyDe = FakeSpeech.voice({ name: "Eddy", voiceURI: "eddy-de", lang: "de-DE", default: false });
        const m = await open([], { speech: new FakeSpeech([hazel, eddyEn, eddyFr, eddyDe]) });
        listenButton(m.content)!.click({});
        const titles = (Menu as any).last.items.map((item: any) => item.title);
        expect(titles).toEqual(["From here", "This chapter", "Voice", "Hazel (default)", "Eddy", "Other languages…"]);
        (Menu as any).last.item("From here").click();
        const voice = bar(m.content)!.oneByClass("reader-listen-voice") as any;
        expect(voice.children.map((o: DomNode) => o.textContent)).toEqual(["Hazel (default)", "Eddy", "Other languages…"]);
        const session = (m.view as any).listen;
        expect(session.entries("en", "french").map((entry: any) => entry.voice.voiceURI)).toEqual(["eddy-fr"]);
        session.chooseVoice("eddy-fr");
        expect(m.speech.speaking!.voice?.voiceURI).toBe("eddy-fr");
        // Your voice from another language stays at hand, its language named.
        expect(voice.children.map((o: DomNode) => o.textContent)).toEqual(["Hazel (default)", "Eddy · French (France)", "Eddy", "Other languages…"]);
    });

    it("says on iPad and iPhone that listening stops when the screen locks (FR-7)", async () => {
        const m = await open();
        withPlatform(IPAD, () => listenButton(m.content)!.click({}));
        expect((Menu as any).last.items.map((item: any) => item.title)).toContain("Listening stops when the screen locks or you leave Obsidian");
        listenButton(m.content)!.click({});
        expect((Menu as any).last.items.map((item: any) => item.title)).not.toContain("Listening stops when the screen locks or you leave Obsidian");
    });

    it("a scanned PDF shows Listen disabled, with its reason (AC-7)", async () => {
        const m = await open();
        (m.view as any).source.imageOnly = true;
        (m.view as any).renderListenButton();
        const button = listenButton(m.content)!;
        expect(button.hasClass(cls("reader-hidden"))).toBe(false);
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe("There is no text to read aloud in a scanned PDF");
        button.click({});
        expect((Menu as any).last).toBeNull();
    });

    it("offers no Listen where the API is missing, or no voice speaks on the device (FR-8)", async () => {
        const none = await open([], { speech: null });
        expect(listenButton(none.content)!.hasClass(cls("reader-hidden"))).toBe(true);
        restore?.();
        const remoteOnly = await open([], { speech: new FakeSpeech([FakeSpeech.voice({ localService: false })]) });
        expect(listenButton(remoteOnly.content)!.hasClass(cls("reader-hidden"))).toBe(true);
    });

    it("offers Listen once voices listed late arrive (Chrome)", async () => {
        const speech = new FakeSpeech().voicesLater();
        const m = await open([], { speech });
        expect(listenButton(m.content)!.hasClass(cls("reader-hidden"))).toBe(true);
        speech.listVoices();
        expect(listenButton(m.content)!.hasClass(cls("reader-hidden"))).toBe(false);
    });

    it("leaving the Reader stops speech", async () => {
        const m = await open();
        listen(m, "From here");
        expect(m.speech.text).not.toBeNull();
        await m.view.onClose();
        expect(m.speech.text).toBeNull();
        expect((m.view as any).listening).toBe(false);
    });

    it("the bar rises 8 px with a fade in the shared beat, and sinks on stop (AC-8, FR-13)", async () => {
        const m = await open();
        listen(m, "From here");
        const el = bar(m.content)!;
        const rise = rec.animations.find((a) => a.target === el)!;
        expect(rise.keyframes).toEqual([
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "translateY(0)" },
        ]);
        expect(rise.options.duration).toBe(250);
        barButton(m.content, "Stop listening")!.click({});
        const sink = rec.animations.filter((a) => a.target === el).at(-1)!;
        expect(sink.keyframes).toEqual([
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(8px)" },
        ]);
        sink.finish();
        expect(el.isConnected).toBe(false);
    });

    it("under reduced motion: no animation, and the column jumps (AC-8, FR-15)", async () => {
        motion();
        motion = reducedMotion(true);
        const m = await open();
        const before = rec.animations.length;
        listen(m, "From here");
        hearChapter(m, 6);
        expect(rec.animations.length).toBe(before);
        expect(m.stage.scrolls.filter((s: any) => s && "top" in s)).toEqual([{ top: Math.round(600 - 700 / 3), behavior: "auto" }]);
        barButton(m.content, "Stop listening")!.click({});
        expect(bar(m.content)).toBeUndefined();
    });
});

describe("the listening session's own rules (#765)", () => {
    function harness() {
        let undo: () => void = () => undefined;
        const p = (text: string) => {
            const el = new DomNode("p") as any;
            el.appendText(text);
            return el;
        };
        undo = withTextNodes();
        const body = new DomNode("div") as any;
        body.appendChild(p("One. Two."));
        body.appendChild(p("Three."));
        const timers: { fn: () => void; ms: number; id: number }[] = [];
        let seq = 0;
        const speech = new FakeSpeech();
        const view: ListenView = {
            body: () => body,
            stage: () => null,
            pager: () => null,
            chapter: () => 0,
            isLast: () => true,
            turn: jest.fn(),
            landsIn: () => 0,
            motion: () => false,
            lang: () => "en",
            prefs: () => ({ rate: 1 }),
            savePrefs: jest.fn(),
            setListening: jest.fn(),
            changed: jest.fn(),
            setTimeout: (fn, ms) => {
                timers.push({ fn, ms, id: ++seq });
                return seq;
            },
            clearTimeout: (id) => {
                const i = timers.findIndex((t) => t.id === id);
                if (i >= 0) timers.splice(i, 1);
            },
        };
        const session = new ListenSession(view, fakeSpeechPort(speech));
        return { session, speech, view, timers, undo };
    }

    it("a lost end goes on after its watchdog, with a debug line", () => {
        const h = harness();
        h.session.start("chapter");
        expect(h.speech.text).toBe("One.");
        h.speech.loseCurrent();
        const watchdog = h.timers.find((t) => t.ms === 4000)!;
        watchdog.fn();
        expect(h.speech.text).toBe("Two.");
        h.undo();
    });

    it("a failed voice pauses with a line, and play goes on from that sentence", () => {
        const h = harness();
        h.session.start("chapter");
        h.speech.failCurrent();
        expect(h.session.status()).toBe("paused");
        expect(h.session.hasFailed()).toBe(true);
        h.session.play();
        expect(h.speech.text).toBe("One.");
        expect(h.session.hasFailed()).toBe(false);
        h.undo();
    });

    it("its own cancel is no failure", () => {
        const h = harness();
        h.session.start("chapter");
        h.session.step(1);
        expect(h.session.hasFailed()).toBe(false);
        expect(h.speech.text).toBe("Two.");
        h.undo();
    });

    it("the last chapter's end stops; it says listening began and ended", () => {
        const h = harness();
        h.session.start("here");
        h.speech.endCurrent();
        h.speech.endCurrent();
        h.speech.endCurrent();
        expect(h.session.active()).toBe(false);
        expect(h.view.turn).not.toHaveBeenCalled();
        expect((h.view.setListening as jest.Mock).mock.calls).toEqual([[true], [false]]);
        h.undo();
    });
});

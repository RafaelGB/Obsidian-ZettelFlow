/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { MarkVisibility } from "architecture/components/core/reader/readerLayers";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import { FileService } from "architecture/plugin/services/FileService";
import { bufferedWrites, currentWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import * as undo from "architecture/plugin/writes/undoNotice";
import * as throughFlow from "architecture/plugin/thinking/crystallizeThroughFlow";
import { recallCitation, renderRecallNote } from "application/library/recallNote";
import type { Thought } from "application/thinking/thought";

/**
 * **Recall** over a mounted Reader (#760): the chapter and your marks put away, the chapter written
 * from memory, then what you marked — yours first — and, only on *Create note*, one note.
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

const BOOK = makeEpub({
    title: "Middlemarch",
    chapters: [1, 2].map((n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: ["Prelude", "Miss Brooke"][n - 1],
        body: Array.from({ length: 6 }, (_, i) => `<p>Chapter ${n} paragraph ${i} goes on for a while.</p>`).join(""),
    })),
});

const STAGE = { left: 0, top: 0, width: 1000, height: 700 };

function mark(id: string, at: number, paragraph: number, over: Partial<Thought> = {}): Thought {
    return {
        id,
        at,
        text: "",
        links: [],
        about: PATH,
        quote: { exact: `Chapter 1 paragraph ${paragraph}`, prefix: "", suffix: "" },
        locator: { at: 0, label: "Chapter 1", chapter: "text/ch1.xhtml" },
        meaning: "idea",
        ...over,
    } as Thought;
}

/** Two highlights made in a known order — the second made first — one with your note on it. */
const MARKS = (): Thought[] => [mark("later", 30, 1, { text: "a note in the margin", meaning: "question" }), mark("sooner", 10, 3)];

let now = 1_000_000;

function mount(thoughts: Thought[]) {
    const book = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
        readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength),
        cachedRead: async () => "",
        modify: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        fileManager: { getNewFileParent: jest.fn(() => ({ path: "Inbox" })) },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "leaf" }, readerPrefs: { font: "sans", size: "medium", theme: "auto" } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: jest.fn(async () => undefined as never),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store, toNote: jest.fn(), selection: () => null, headingAt: () => undefined });
    return { view, content, host, store, vault, app };
}

function layOut(content: DomNode) {
    const stage = content.oneByClass("reader-stage") as any;
    stage.clientHeight = STAGE.height;
    const proto = DomNode.prototype as any;
    const plain = proto.getBoundingClientRect;
    const hadRects = Object.prototype.hasOwnProperty.call(proto, "getClientRects");
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this === stage) return { ...STAGE };
        return { left: 100, top: 40, width: 600, height: 20 };
    };
    proto.getClientRects = function (this: DomNode) {
        return this.tag === "mark" ? [{ left: 120, top: 60, width: 80, height: 18 }] : [];
    };
    return {
        stage,
        restore: () => {
            proto.getBoundingClientRect = plain;
            if (!hadRects) delete proto.getClientRects;
        },
    };
}

const FOLDED = cls("reader-page--folded");
const AWAY = cls("reader-highlight--away");
const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const marksOn = (content: DomNode, id: string) => livePage(content)!.findAll((el) => el.tag === "mark" && el.getAttribute("data-hl") === id);
const awayOnPage = (content: DomNode) => [...new Set(livePage(content)!.findAll((el) => el.tag === "mark" && el.hasClass(AWAY)).map((el) => el.getAttribute("data-hl")))].sort();
const panel = (content: DomNode) => content.oneByClass("reader-panel");
const card = (content: DomNode) => panel(content).oneByClass("reader-recall");
const button = (root: DomNode, name: string) => root.find((el) => el.tag === "button" && el.hasClass(cls(name)))!;
const contentsButton = (content: DomNode) => content.oneByClass("reader-bar").find((el) => el.tag === "button" && (el.getAttribute("aria-label") ?? "").startsWith("Contents"))!;
const box = (content: DomNode) => card(content).oneByClass("reader-recall-box") as DomNode & { value: string; readOnly: boolean };
const sheets = (content: DomNode) => content.byClass("turn-sheet");
const lifts = (rec: AnimationRecord) => rec.animations.filter((a) => (a.target as DomNode).hasClass?.(cls("reader-ink-lift")));

function type(m: { content: DomNode }, words: string) {
    const area = box(m.content);
    area.value = words;
    area.fire("input");
}

describe("recall, over the Reader (#760)", () => {
    let undoText: () => void;
    let rec: AnimationRecord;
    let motion: () => void;
    let restore: (() => void) | null = null;
    let listeners: Map<string, ((event: unknown) => void)[]>;
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
        listeners = new Map();
        g.addEventListener = (name: string, fn: (event: unknown) => void) => listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        g.removeEventListener = (name: string, fn: (event: unknown) => void) => listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn));
        g.getSelection = () => ({ isCollapsed: true, toString: () => "" });
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
        jest.spyOn(throughFlow, "crystallizeFlowPath").mockReturnValue("");
    });
    afterEach(() => {
        endChapterTurn();
        restore?.();
        restore = null;
        rec.stop();
        motion();
        delete g.getSelection;
        delete g.createDiv;
        jest.restoreAllMocks();
    });

    async function open(thoughts: Thought[] = MARKS(), drawn = (m: ReturnType<typeof mount>) => marksOn(m.content, "sooner").length > 0) {
        const m = mount(thoughts);
        await m.view.setState({ source: PATH, chapter: 0 }, {} as never);
        await m.view.onOpen();
        await settle(() => (livePage(m.content)?.byClass("reader-next").length ?? 0) > 0);
        const laid = layOut(m.content);
        restore = laid.restore;
        await settle(() => drawn(m));
        return { ...m, ...laid };
    }

    /** Contents → *Recall this chapter*, the fold played out. */
    async function recall(m: Awaited<ReturnType<typeof open>>) {
        contentsButton(m.content).click();
        const door = panel(m.content).find((el) => el.tag === "button" && el.hasClass(cls("reader-recall-door")))!;
        // A head action now (#812 FR-11): its name is its label and its tooltip.
        expect(door.getAttribute("aria-label")).toBe("Recall this chapter");
        door.click();
        rec.finishAll();
        await flush();
    }

    async function reveal(m: Awaited<ReturnType<typeof open>>) {
        button(card(m.content), "reader-recall-reveal").click();
        rec.finishAll();
        await flush();
        await flush();
        rec.finishAll();
    }

    describe("putting the chapter away (AC-1, AC-2, FR-2, FR-3)", () => {
        it("from Contents: folds the page, leaves the chapter's name, hides every mark through MarkVisibility, and asks", async () => {
            const m = await open();
            const hideAll = jest.spyOn(MarkVisibility.prototype, "hideAll");
            await recall(m);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(true);
            expect(m.content.oneByClass("turn-fold").textContent).toBe(m.content.oneByClass("reader-recall-chapter").textContent);
            expect(hideAll).toHaveBeenCalledTimes(1);
            expect(awayOnPage(m.content)).toEqual(["later", "sooner"]);
            const c0 = card(m.content);
            expect(c0.oneByClass("reader-panel-title").textContent).toBe("Recall");
            expect(c0.oneByClass("reader-recall-question").hasClass("is-shown")).toBe(true);
            expect(c0.oneByClass("reader-recall-question").textContent).toBe("Without looking: what was this chapter's argument?");
            const area = box(m.content);
            expect(area.value).toBe("");
            expect(area.getAttribute("placeholder")).toBe("In your own words…");
            // Yours exactly: nothing corrects, capitalises or completes what you type (FR-3).
            for (const [attr, value] of [["spellcheck", "false"], ["autocorrect", "off"], ["autocapitalize", "off"], ["autocomplete", "off"]]) expect(area.getAttribute(attr)).toBe(value);
            // It lies beside the page, as Alongside does; the margin's list steps back.
            expect(panel(m.content).hasClass(cls("reader-panel--side"))).toBe(true);
            expect(m.content.hasClass(cls("reader--drawer")) || m.content.find((el) => el.hasClass(cls("reader--drawer"))) !== undefined).toBe(true);
            // Nothing is offered to keep before you have looked.
            expect(c0.find((el) => el.hasClass(cls("reader-recall-keep")))).toBeUndefined();
        });

        it("keeps what you type exactly as typed, a typo too", async () => {
            const m = await open();
            await recall(m);
            type(m, "Dorothea wants a lif of meaning.\nShe marries the wrong man.");
            expect(box(m.content).value).toBe("Dorothea wants a lif of meaning.\nShe marries the wrong man.");
        });
    });

    describe("the reveal (AC-1, AC-7, FR-4, FR-5, FR-12)", () => {
        it("brings the page back, then your marks in the order you made them, and lists them under what you wrote", async () => {
            const m = await open();
            await recall(m);
            type(m, "Mine.");
            const area = box(m.content);
            const reveal = jest.spyOn(MarkVisibility.prototype, "reveal");
            await reveal_(m);
            expect(reveal).toHaveBeenCalledTimes(1);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(false);
            expect(m.content.byClass("turn-fold")).toHaveLength(0);
            expect(awayOnPage(m.content)).toEqual([]);
            const c0 = card(m.content);
            // What you wrote first, in the place the question was; the same box, with your words.
            expect(c0.oneByClass("reader-recall-wrote").hasClass("is-shown")).toBe(true);
            expect(c0.oneByClass("reader-recall-question").hasClass("is-shown")).toBe(false);
            expect(box(m.content)).toBe(area);
            expect(area.value).toBe("Mine.");
            const order = c0.children.map((el) => [...el.classes].find((name) => name.startsWith(cls("reader-recall-"))));
            expect(order.indexOf(cls("reader-recall-ask"))).toBeLessThan(order.indexOf(cls("reader-recall-box")));
            expect(order.indexOf(cls("reader-recall-box"))).toBeLessThan(order.indexOf(cls("reader-recall-marked")));
            // What you marked then: in the order you made them, each with its colour, passage and note.
            const marked = c0.oneByClass("reader-recall-marked");
            expect(marked.oneByClass("reader-hl-heading").textContent).toBe("What you marked then");
            const rows = marked.byClass("reader-recall-mark");
            expect(rows.map((row) => row.getAttribute("data-hl"))).toEqual(["sooner", "later"]);
            expect(rows[1].hasClass(cls("reader-hl-item--question"))).toBe(true);
            expect(rows[1].oneByClass("reader-hl-note").textContent).toBe("a note in the margin");
            expect(rows[0].oneByClass("reader-hl-quote").textContent).toBe("Chapter 1 paragraph 3");
            // No number, no match, no score: only the book's words and yours carry a digit (AC-7).
            const own = c0.findAll((el) => (el.text ?? "") !== "" && !el.closest?.(`.${cls("reader-hl-quote")}`) && !el.closest?.(`.${cls("reader-hl-note")}`) && !el.closest?.(`.${cls("reader-recall-chapter")}`));
            for (const el of own) expect(el.text ?? "").not.toMatch(/\d/);
            for (const word of ["score", "match", "remembered", "of 2"]) expect(c0.textContent.toLowerCase()).not.toContain(word);
        });

        async function reveal_(m: Awaited<ReturnType<typeof open>>) {
            await reveal(m);
        }

        it("says plainly when nothing was marked — and still offers to keep your words (FR-5)", async () => {
            const m = await open([], (m) => (m.store.highlightsAbout as jest.Mock).mock.calls.length >= 1);
            await settle(() => false, 20, 0);
            await recall(m);
            type(m, "Nothing marked, but this stayed.");
            await reveal(m);
            const c0 = card(m.content);
            expect(c0.oneByClass("reader-recall-nothing").textContent).toBe("You marked nothing in this chapter");
            expect(button(c0, "reader-recall-keep").textContent).toBe("Keep it as a note");
        });
    });

    describe("keeping it as a note (AC-3, AC-4, FR-6)", () => {
        it("previews exactly what will be written; Create note writes one note, create-only, recorded, with Undo", async () => {
            const m = await open();
            await recall(m);
            const words = "Dorothea wants a lif of meaning.\n\nShe marries the wrong man.  \n";
            type(m, words);
            await reveal(m);
            button(card(m.content), "reader-recall-keep").click();
            const preview = card(m.content).oneByClass("reader-recall-preview");
            const title = preview.oneByClass("reader-recall-title") as DomNode & { value: string };
            const chapter = card(m.content).oneByClass("reader-recall-chapter").textContent;
            expect(title.value).toBe(`${chapter} — in my words`);
            const citation = recallCitation({ file: PATH, chapter: "OEBPS/text/ch1.xhtml", label: chapter, bookTitle: "Middlemarch" });
            expect(preview.oneByClass("reader-recall-note").textContent).toBe(renderRecallNote(words, citation).trimEnd());
            // Your words exactly, and nothing of the book you did not type.
            expect(preview.oneByClass("reader-recall-note").textContent).not.toContain("paragraph");
            expect(m.content.oneByClass("reader-recall-box")).toBeDefined();
            title.value = "What Middlemarch argued";
            title.fire("input");
            const batches: (string | undefined)[] = [];
            const create = jest.spyOn(FileService, "createFile").mockImplementation(async () => {
                batches.push(currentWriteBatch());
                return {} as never;
            });
            const undone = jest.spyOn(undo, "undoBatch").mockResolvedValue({ hadWork: true, done: 1, failed: [] });
            button(preview, "reader-recall-create").click();
            await settle(() => create.mock.calls.length > 0 && card(m.content).byClass("reader-recall-status").length > 0);
            expect(create).toHaveBeenCalledTimes(1);
            expect(create.mock.calls[0]).toEqual(["Inbox/What Middlemarch argued.md", renderRecallNote(words, citation), false]);
            expect(batches[0]).toEqual(expect.any(String));
            const status = card(m.content).oneByClass("reader-recall-status");
            expect(status.textContent).toContain("Kept as What Middlemarch argued");
            button(status, "reader-recall-link").click();
            expect(m.app.workspace.openLinkText).toHaveBeenCalledWith("Inbox/What Middlemarch argued.md", "", "tab");
            const links = status.findAll((el) => el.tag === "button");
            expect(links.map((el) => el.textContent)).toEqual(["Open", "Undo"]);
            links[1].click();
            await settle(() => undone.mock.calls.length > 0);
            expect(undone).toHaveBeenCalledWith(batches[0]);
            // Taken back: your words are still here, to keep again.
            await settle(() => card(m.content).byClass("reader-recall-keep").length > 0);
            expect(box(m.content).value).toBe(words);
        });

        it("a free path, never over a note that exists", async () => {
            const m = await open();
            const taken = file("Inbox/Mine.md");
            const original = m.vault.getAbstractFileByPath;
            (m.vault as any).getAbstractFileByPath = (path: string) => (path === taken.path ? taken : original(path));
            await recall(m);
            type(m, "Mine.");
            await reveal(m);
            button(card(m.content), "reader-recall-keep").click();
            const title = card(m.content).oneByClass("reader-recall-title") as DomNode & { value: string };
            title.value = "Mine";
            title.fire("input");
            const create = jest.spyOn(FileService, "createFile").mockResolvedValue({} as never);
            button(card(m.content), "reader-recall-create").click();
            await settle(() => create.mock.calls.length > 0);
            expect(create.mock.calls[0][0]).toBe("Inbox/Mine 2.md");
        });

        it("Cancel and Done write nothing", async () => {
            const m = await open();
            const writes = bufferedWrites().length;
            const create = jest.spyOn(FileService, "createFile");
            await recall(m);
            type(m, "Mine.");
            await reveal(m);
            button(card(m.content), "reader-recall-keep").click();
            button(card(m.content), "reader-recall-cancel").click();
            expect(card(m.content).byClass("reader-recall-preview")).toHaveLength(0);
            button(card(m.content), "reader-recall-done").click();
            rec.finishAll();
            await flush();
            expect(create).not.toHaveBeenCalled();
            expect(bufferedWrites().length).toBe(writes);
            for (const write of [m.vault.modify, m.vault.create, m.vault.process]) expect(write).not.toHaveBeenCalled();
            expect(m.store.write).not.toHaveBeenCalled();
            expect(m.store.save).not.toHaveBeenCalled();
        });

        it("continues in the crystallize flow when a canvas holds that role, and writes nothing itself", async () => {
            const m = await open();
            (throughFlow.crystallizeFlowPath as jest.Mock).mockReturnValue("Flows/Crystallize.canvas");
            const through = jest.spyOn(throughFlow, "crystallizeThroughFlow").mockResolvedValue("opened");
            const create = jest.spyOn(FileService, "createFile");
            await recall(m);
            type(m, "Mine.");
            await reveal(m);
            button(card(m.content), "reader-recall-keep").click();
            const preview = card(m.content).oneByClass("reader-recall-preview");
            expect(preview.oneByClass("reader-recall-flow").textContent).toContain("Crystallize");
            expect(button(preview, "reader-recall-create").textContent).toBe("Continue in Crystallize");
            button(preview, "reader-recall-create").click();
            await settle(() => through.mock.calls.length > 0);
            expect(through.mock.calls[0][0]).toMatchObject({ body: "Mine.", flowPath: "Flows/Crystallize.canvas" });
            expect(create).not.toHaveBeenCalled();
        });
    });

    describe("the draft, for the sitting (AC-6, FR-7, FR-8)", () => {
        it("Done brings the page and the marks back; recalling again shows your words; a new Reader an empty box", async () => {
            const m = await open();
            await recall(m);
            type(m, "Half a thought");
            button(card(m.content), "reader-recall-done").click();
            rec.finishAll();
            await flush();
            await flush();
            rec.finishAll();
            await settle(() => !panel(m.content).hasClass(cls("reader-panel--open")), 40);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(false);
            expect(awayOnPage(m.content)).toEqual([]);
            await recall(m);
            expect(box(m.content).value).toBe("Half a thought");
            // Closing the Reader lets it go: a new one starts with an empty box.
            restore?.();
            restore = null;
            const again = await open();
            await recall(again);
            expect(box(again.content).value).toBe("");
        });

        it("Esc leaves recall like Done: the page comes back, nothing is written", async () => {
            const m = await open();
            await recall(m);
            (m.view as any).escape();
            rec.finishAll();
            await flush();
            await flush();
            rec.finishAll();
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(false);
            expect(awayOnPage(m.content)).toEqual([]);
        });

        it("a chapter turned lets recall go at once, the draft kept", async () => {
            const m = await open();
            await recall(m);
            type(m, "Kept for later");
            (m.view as any).show(1);
            await settle(() => !panel(m.content).hasClass(cls("reader-panel--open")));
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(false);
            expect(m.content.byClass("turn-fold")).toHaveLength(0);
            expect((m.view as any).recallDrafts.get(`${PATH}#0`)).toBe("Kept for later");
        });
    });

    describe("from the leaf (FR-1)", () => {
        it("the leaf's foot offers it: the book goes back onto the chapter, and it is put away", async () => {
            const m = await open();
            (m.view as any).enterLeaf(0);
            await settle(() => (livePage(m.content)?.byClass("reader-survived").length ?? 0) > 0);
            const foot = livePage(m.content)!.oneByClass("reader-survived-foot");
            const door = foot.find((el) => el.getAttribute("data-zf-recall") === "true")!;
            expect(door.textContent).toBe("Recall this chapter");
            door.click();
            rec.finishAll();
            await settle(() => panel(m.content).byClass("reader-recall").length > 0, 60);
            rec.finishAll();
            await flush();
            expect(livePage(m.content)!.byClass("reader-survived")).toHaveLength(0);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(true);
        });
    });

    describe("motion and feel (AC-8, FR-10 – FR-13)", () => {
        it("one gesture away: the sheet slides down over `cover` while the question rises 8 px and fades in", async () => {
            const m = await open();
            contentsButton(m.content).click();
            rec.animations.length = 0;
            panel(m.content).find((el) => el.hasClass(cls("reader-recall-door")))!.click();
            const sheet = sheets(m.content)[0];
            const slide = rec.animations.find((a) => a.target === sheet)!;
            expect(slide.duration).toBe(MOTION.cover);
            expect(slide.keyframes[0]).toEqual({ transform: "translateY(0px)" });
            const question = rec.animations.find((a) => (a.target as DomNode).hasClass?.(cls("reader-recall-question")))!;
            expect(question.keyframes[0]).toEqual({ opacity: 0, transform: "translateY(8px)" });
            expect(question.duration).toBe(MOTION.cover);
            for (const key of rec.keys()) expect(["transform", "opacity", "offset", "easing"]).toContain(key);
        });

        it("the reveal plays it backwards: the sheet up first, and only once it has landed do the marks return", async () => {
            const m = await open();
            await recall(m);
            rec.animations.length = 0;
            button(card(m.content), "reader-recall-reveal").click();
            const sheet = sheets(m.content)[0];
            const slide = rec.animations.find((a) => a.target === sheet)!;
            expect(slide.keyframes[1]).toEqual({ transform: "translateY(0px)" });
            expect(lifts(rec)).toEqual([]);
            expect(awayOnPage(m.content)).toEqual(["later", "sooner"]);
            slide.finish();
            await flush();
            await flush();
            // In the order you made them: sooner (10), later (30).
            const ink = lifts(rec);
            expect(ink.length).toBe(2);
            expect(ink.map((a) => (a.options as any).delay)).toEqual([0, expect.any(Number)]);
            const rows = rec.animations.filter((a) => (a.target as DomNode).hasClass?.(cls("reader-recall-mark")));
            expect(rows.length).toBe(2);
        });

        it("any key mid-move completes it", async () => {
            const m = await open();
            contentsButton(m.content).click();
            panel(m.content).find((el) => el.hasClass(cls("reader-recall-door")))!.click();
            expect(sheets(m.content)).toHaveLength(1);
            for (const fn of listeners.get("keydown") ?? []) fn({});
            await flush();
            expect(sheets(m.content)).toHaveLength(0);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(true);
        });

        it("under reduced motion the page goes and comes back at once, every mark there at once: no animation", async () => {
            motion();
            motion = reducedMotion(true);
            const m = await open();
            rec.animations.length = 0;
            await recall(m);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(true);
            await reveal(m);
            expect(livePage(m.content)!.hasClass(FOLDED)).toBe(false);
            expect(awayOnPage(m.content)).toEqual([]);
            expect(rec.animations).toEqual([]);
        });
    });
});

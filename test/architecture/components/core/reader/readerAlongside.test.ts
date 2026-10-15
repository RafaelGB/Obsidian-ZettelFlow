/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach, afterAll } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { MarkdownRenderer, TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { log } from "architecture";
import { DomNode, flush, installBrowserGlobals, settle } from "../../../../support/dashboardDom";
import { withPlatform, IPAD } from "../../../../support/platform";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { ALONGSIDE_SETTLE_MS, ALONGSIDE_STORAGE_KEY } from "architecture/components/core/reader/readerAlongside";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea, Claim } from "architecture/knowledge/model/Idea";
import { chapterVerdict, type Judgement } from "architecture/knowledge/judgement";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import type { Thought } from "application/thinking/thought";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

function idea(path: string, title: string, relations: { to: string; type?: string }[] = [], claims: Claim[] = []): Idea {
    return {
        path,
        title,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to })),
        claims,
        maturitySignals: { inDegree: 0, outDegree: relations.length, degree: relations.length, hasSources: false },
    };
}

/**
 * The spec's walk as a vault: the chapter's note *a* is supported by *Support*, contradicted by *Ship
 * early* and asks *Does this hold?*; *Planning fallacy* links *Optimism bias*; *Lone* is near nothing.
 */
function vault(): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build([
        idea("a.md", "a", [{ to: "support.md", type: "supports" }, { to: "q.md", type: "question" }]),
        idea("support.md", "Support"),
        idea("q.md", "Does this hold?"),
        idea("ship.md", "Ship early", [{ to: "a.md", type: "contradicts" }, { to: "pf.md", type: "contradicts" }]),
        idea("pf.md", "Planning fallacy", [{ to: "ob.md" }]),
        idea("ob.md", "Optimism bias"),
        idea("born.md", "Born note", [], [{ text: "From the paper", sources: [{ ref: "Papers/cap.pdf", kind: "link" }] }]),
    ]);
    return model;
}

/** Twelve paragraphs; the third names *Planning fallacy*, the ninth *Optimism bias*. */
const PARAS = Array.from({ length: 12 }, (_, i) =>
    i === 2 ? "We fall for the planning fallacy every single time." : i === 8 ? "And optimism bias makes it worse." : `Paragraph ${i} of the chapter.`
);
const BODY = PARAS.join("\n\n");

interface Options {
    model?: KnowledgeModel;
    status?: string;
    kept?: unknown;
    thoughts?: Thought[];
    failing?: boolean;
}

function judgements() {
    const log: Judgement[] = [];
    return {
        log,
        entries: () => [...log],
        record: jest.fn((entry: Omit<Judgement, "at">) => {
            const stored = { at: log.length + 1, ...entry } as Judgement;
            log.push(stored);
            return stored;
        }),
        remove: jest.fn((entry: Judgement) => {
            const at = log.indexOf(entry);
            if (at >= 0) log.splice(at, 1);
        }),
    };
}

function mount(options: Options = {}) {
    const files: Record<string, string> = { "a.md": BODY, "b.md": "The body of B.", "support.md": "Support says so.", "ship.md": "Ship early, learn.", "pf.md": "PF" };
    const storage: Record<string, unknown> = { [ALONGSIDE_STORAGE_KEY]: options.kept };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
        loadLocalStorage: jest.fn((key: string) => storage[key]),
        saveLocalStorage: jest.fn((key: string, value: unknown) => {
            storage[key] = value;
        }),
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: {}, saveSettings: jest.fn(async () => undefined) };
    const model = options.model ?? vault();
    const index = {
        status: options.status ?? "ready",
        getModel: () => {
            if (options.failing) throw new Error("index broke");
            return model;
        },
    };
    const record = judgements();
    const view = new ReaderView(leaf, host, {}, {}, { index, thoughts: async () => options.thoughts ?? [], thoughtFolder: () => "Lab", judgements: record });
    return { view, app, content, host, index, record, storage };
}

/** A note reading of a.md, laid out as a 1200 × 900 stage, each paragraph 100 px tall. */
async function open(options: Options = {}, size = { width: 1200, height: 900 }) {
    const m = mount(options);
    await m.view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"] }, {} as never);
    await m.view.onOpen();
    await flush();
    const root = m.content.oneByClass("reader") as any;
    const stage = m.content.oneByClass("reader-stage") as any;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, ...size });
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: size.width, height: size.height - 100 });
    stage.clientHeight = 800;
    stage.scrollHeight = 4000;
    layOut(m.content, stage, root);
    return { ...m, root, stage };
}

/** The paragraphs as a browser would lay them out: 100 px each — 150 when the column is narrowed. */
function layOut(content: DomNode, stage: any, root: any) {
    const paragraphs = content.oneByClass("reader-body").findAll((el) => el.tag === "p") as any[];
    paragraphs.forEach((p, i) => {
        p.getBoundingClientRect = () => {
            const h = root.hasClass("zettelkasten-flow__reader--alongside") ? 150 : 100;
            return { left: 0, top: i * h - stage.scrollTop, width: 600, height: h };
        };
    });
    return paragraphs;
}

const alongsideButton = (content: DomNode) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Alongside")!;
const panel = (content: DomNode) => content.oneByClass("reader-panel") as any;
const chips = (content: DomNode) => content.byClass("reader-alongside-lens");
const chip = (content: DomNode, label: string) => chips(content).find((el) => el.text === label)!;
const cards = (content: DomNode) => content.byClass("reader-alongside-card").filter((card) => !card.hasClass("zettelkasten-flow__reader-alongside-undo"));
const titles = (content: DomNode) => cards(content).map((card) => card.oneByClass("reader-alongside-title").textContent);
const card = (content: DomNode, title: string) => cards(content).find((el) => el.oneByClass("reader-alongside-title").textContent === title)!;
const why = (content: DomNode, title: string) => card(content, title).oneByClass("reader-alongside-why").textContent;
const state = (content: DomNode) => content.oneByClass("reader-alongside-state");

describe("Alongside: your vault beside the page (#754)", () => {
    beforeEach(() => {
        installBrowserGlobals();
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("is the context panel, renamed and empowered: the same button opens Alongside, near this paragraph (AC-4)", async () => {
        const { content } = await open();
        alongsideButton(content).click();
        await flush();
        expect(panel(content).hasClass("zettelkasten-flow__reader-panel--open")).toBe(true);
        expect(content.oneByClass("reader-panel").oneByClass("reader-panel-title").textContent).toBe("Alongside");
        expect(content.oneByClass("reader-alongside-near").textContent).toBe("Near this paragraph");
        expect(chips(content).map((el) => el.text)).toEqual(["All", "Connections", "Contradictions", "Questions", "Your knowledge", "Research", "Not yet notes"]);
    });

    it("carries no number on any lens (AC-5)", async () => {
        const { content } = await open();
        alongsideButton(content).click();
        await flush();
        for (const el of chips(content)) expect(el.textContent).not.toMatch(/\d/);
    });

    it("keeps what a note reading showed — supports, argues back, open questions — under their lenses (AC-4)", async () => {
        const { content } = await open();
        alongsideButton(content).click();
        await flush();
        chip(content, "Connections").click();
        expect(titles(content)).toContain("Support");
        expect(why(content, "Support")).toBe("Linked from a");
        chip(content, "Contradictions").click();
        expect(titles(content)).toEqual(["Ship early"]);
        expect(why(content, "Ship early")).toBe("Contradicts a");
        expect(card(content, "Ship early").byClass("reader-alongside-action").map((b) => b.text)).toEqual(["Look at both", "Not related"]);
        chip(content, "Questions").click();
        expect(titles(content)).toEqual(["Does this hold?"]);
        chip(content, "Research").click();
        expect(titles(content)).toEqual([]);
        expect(state(content).textContent).toBe("Nothing of yours touches this passage through this lens.");
    });

    it("follows the paragraph at the reading line: what it names, and why", async () => {
        const { content, stage } = await open();
        stage.scrollTop = 0; // the line (a third of 800) is in the third paragraph
        alongsideButton(content).click();
        await flush();
        expect(titles(content)).toContain("Planning fallacy");
        expect(why(content, "Planning fallacy")).toBe("Named in this paragraph");
        chip(content, "Connections").click();
        expect(why(content, "Optimism bias")).toBe("Linked from Planning fallacy");
    });

    it("says it is reading the vault while the index builds, and why when it fails (FR-11)", async () => {
        const building = await open({ status: "building" });
        alongsideButton(building.content).click();
        await flush();
        expect(state(building.content).textContent).toBe("Reading your vault…");
        expect(building.content.byClass("progress").length + building.content.byClass("spinner").length).toBe(0);

        const warn = jest.spyOn(log, "warn");
        const failing = await open({ failing: true });
        alongsideButton(failing.content).click();
        await flush();
        expect(state(failing.content).textContent).toBe("Couldn't read your vault. Your highlights are still here.");
        expect(warn).toHaveBeenCalled();
    });

    it("says so, and asks you to read on, when nothing of yours is near (FR-10)", async () => {
        const model = new KnowledgeModel();
        model.build([idea("a.md", "a"), idea("lone.md", "Lone note")]);
        const { content } = await open({ model });
        alongsideButton(content).click();
        await flush();
        expect(cards(content)).toHaveLength(0);
        expect(state(content).textContent).toBe("Nothing of yours is near this paragraph yet. Mark it, link it, or keep reading.");
    });

    it("reads a card in a peek, and the page does not move (AC-6, FR-8)", async () => {
        const { content, stage } = await open();
        stage.scrollTop = 120;
        alongsideButton(content).click();
        await flush();
        const before = stage.scrollTop;
        card(content, "Planning fallacy").oneByClass("reader-alongside-title").click();
        await flush();
        const peek = content.oneByClass("reader-peek");
        expect(card(content, "Planning fallacy").contains(peek)).toBe(true);
        expect(peek.oneByClass("reader-peek-title").textContent).toBe("pf");
        expect(stage.scrollTop).toBe(before);
    });

    it("puts the note right under the paragraph for Look at both (AC-6, FR-9)", async () => {
        const { content, stage } = await open();
        stage.scrollTop = 0;
        alongsideButton(content).click();
        await flush();
        chip(content, "Contradictions").click();
        card(content, "Ship early").byClass("reader-alongside-action")[0].click();
        await flush();
        const paragraph = content.oneByClass("reader-body").findAll((el) => el.tag === "p")[2];
        const siblings = paragraph.parentElement!.children;
        expect(siblings[siblings.indexOf(paragraph) + 1]).toBe(content.oneByClass("reader-peek"));
    });

    it("records Not related once for this chapter, sets the card aside, and Undo takes it back (FR-9, AC-3)", async () => {
        const { content, record } = await open();
        alongsideButton(content).click();
        await flush();
        chip(content, "Contradictions").click();
        card(content, "Ship early").byClass("reader-alongside-action")[1].click();
        expect(record.record).toHaveBeenCalledTimes(1);
        expect(record.record).toHaveBeenCalledWith(chapterVerdict("ship.md", "a.md", "a.md"));
        expect(titles(content)).toEqual([]);
        const undo = content.oneByClass("reader-alongside-undo");
        expect(undo.textContent).toContain("Not related to this chapter");
        // The Undo stands in the card's place: the lens is not said to be empty under it.
        expect(state(content).hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
        undo.byClass("reader-alongside-action")[0].click();
        expect(record.remove).toHaveBeenCalledTimes(1);
        expect(titles(content)).toEqual(["Ship early"]);
        expect(content.byClass("reader-alongside-undo")).toHaveLength(0);
    });

    it("takes the Undo away when the chapter turns: it belongs to the chapter it was offered in", async () => {
        const { content, view } = await open();
        alongsideButton(content).click();
        await flush();
        chip(content, "Contradictions").click();
        card(content, "Ship early").byClass("reader-alongside-action")[1].click();
        expect(content.byClass("reader-alongside-undo")).toHaveLength(1);
        (view as any).show(1);
        await flush();
        await new Promise((resolve) => setTimeout(resolve, ALONGSIDE_SETTLE_MS + 30));
        expect(content.byClass("reader-alongside-undo")).toHaveLength(0);
    });

    it("writes nothing to any note while you open it, read on and switch lenses (FR-12, AC-7)", async () => {
        const writes = [
            ...Object.getOwnPropertyNames(FileService).filter((name) => typeof (FileService as any)[name] === "function").map((name) => jest.spyOn(FileService as any, name)),
            ...Object.getOwnPropertyNames(FrontmatterService.prototype).filter((name) => name !== "constructor").map((name) => jest.spyOn(FrontmatterService.prototype as any, name)),
        ];
        const { content, stage } = await open();
        alongsideButton(content).click();
        await flush();
        stage.scrollTop = 600;
        stage.fire("scroll");
        await new Promise((resolve) => setTimeout(resolve, ALONGSIDE_SETTLE_MS + 30));
        for (const label of ["Connections", "Contradictions", "Questions", "Your knowledge", "Research", "Not yet notes", "All"]) chip(content, label).click();
        for (const spy of writes) expect(spy).not.toHaveBeenCalled();
    });

    it("never imports a writer: the one write is the verdict (FR-12)", () => {
        const source = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "reader", "readerAlongside.ts"), "utf8");
        expect(source).not.toMatch(/FileService|FrontmatterService|\.save\(|vault\.(modify|create|process)/);
    });

    it("follows the reading only once it settles: nothing while you scroll, once 150 ms after (AC-8)", async () => {
        const { content, stage, view } = await open();
        alongsideButton(content).click();
        await flush();
        const passage = jest.spyOn(view as any, "alongsidePassage");
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
        for (let i = 0; i < 20; i++) {
            stage.scrollTop = i * 5;
            stage.fire("scroll");
            jest.advanceTimersByTime(5);
        }
        expect(passage).not.toHaveBeenCalled();
        jest.advanceTimersByTime(ALONGSIDE_SETTLE_MS);
        expect(passage).toHaveBeenCalledTimes(1);
    });

    it("moves nothing under the pointer: a settled reading waits until it leaves (FR-19)", async () => {
        const { content, stage } = await open();
        stage.scrollTop = 0;
        alongsideButton(content).click();
        await flush();
        expect(titles(content)).toContain("Planning fallacy");
        panel(content).fire("pointerenter");
        stage.scrollTop = 1000; // the ninth paragraph, in the narrowed column: optimism bias
        stage.fire("scroll");
        await new Promise((resolve) => setTimeout(resolve, ALONGSIDE_SETTLE_MS + 30));
        const held = cards(content);
        expect(why(content, "Optimism bias")).toBe("Linked from Planning fallacy");
        panel(content).fire("pointerleave");
        expect(why(content, "Optimism bias")).toBe("Named in this paragraph");
        // The cards that stayed are the same elements: they moved, nothing was redrawn.
        expect(cards(content).filter((el) => held.includes(el)).length).toBeGreaterThan(0);
    });

    it("follows your selection, and says so (FR-2)", async () => {
        const { content } = await open();
        const paragraph = content.oneByClass("reader-body").findAll((el) => el.tag === "p")[8] as any;
        paragraph.nodeType = 1;
        (globalThis as any).getSelection = () => ({
            isCollapsed: false,
            rangeCount: 1,
            toString: () => "optimism bias",
            getRangeAt: () => ({ commonAncestorContainer: paragraph, startContainer: paragraph }),
        });
        try {
            alongsideButton(content).click();
            await flush();
            expect(content.oneByClass("reader-alongside-near").textContent).toBe("Near your selection");
            expect(why(content, "Optimism bias")).toBe("Named in your selection");
        } finally {
            delete (globalThis as any).getSelection;
        }
    });

    it("keeps the paragraph you are reading where your eye is while the column narrows (AC-10, FR-17)", async () => {
        const { content, stage, root } = await open();
        stage.scrollTop = 120;
        const paragraphs = layOut(content, stage, root);
        const line = 800 / 3;
        const at = paragraphs.findIndex((p) => p.getBoundingClientRect().top + p.getBoundingClientRect().height > line);
        const share = (line - paragraphs[at].getBoundingClientRect().top) / paragraphs[at].getBoundingClientRect().height;
        alongsideButton(content).click();
        await flush();
        expect(root.hasClass("zettelkasten-flow__reader--alongside")).toBe(true);
        expect(panel(content).hasClass("zettelkasten-flow__reader-panel--side")).toBe(true);
        const box = paragraphs[at].getBoundingClientRect();
        expect(Math.abs(box.top + share * box.height - line)).toBeLessThan(1);
    });

    it("docks Type beside the column too, never a card over it, the reading line kept (#809 FR-11, FR-13)", async () => {
        const { content, stage, root } = await open();
        stage.scrollTop = 120;
        const paragraphs = layOut(content, stage, root);
        const line = 800 / 3;
        const at = paragraphs.findIndex((p) => p.getBoundingClientRect().top + p.getBoundingClientRect().height > line);
        const share = (line - paragraphs[at].getBoundingClientRect().top) / paragraphs[at].getBoundingClientRect().height;
        content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!.click();
        await flush();
        expect(panel(content).hasClass("zettelkasten-flow__reader-panel--side")).toBe(true);
        expect(root.hasClass("zettelkasten-flow__reader--alongside")).toBe(true);
        const box = paragraphs[at].getBoundingClientRect();
        expect(Math.abs(box.top + share * box.height - line)).toBeLessThan(1);
    });

    it("Type rises as the sheet in portrait on an iPad (#809 FR-12)", async () => {
        await withPlatform(IPAD, async () => {
            const { content } = await open({}, { width: 820, height: 1180 });
            content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!.click();
            await flush();
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--sheet")).toBe(true);
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--side")).toBe(false);
        });
    });

    it("rises as the sheet in portrait on an iPad (FR-14)", async () => {
        await withPlatform(IPAD, async () => {
            const { content } = await open({}, { width: 820, height: 1180 });
            alongsideButton(content).click();
            await flush();
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--sheet")).toBe(true);
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--side")).toBe(false);
            expect(content.oneByClass("reader-panel").oneByClass("reader-panel-title").textContent).toBe("Alongside");
        });
    });

    it("remembers on this device whether it is open and the lens you chose, never in the vault (FR-13)", async () => {
        const { content, app, host } = await open();
        const saves = host.saveSettings.mock.calls.length;
        alongsideButton(content).click();
        await flush();
        chip(content, "Questions").click();
        expect(app.saveLocalStorage).toHaveBeenLastCalledWith(ALONGSIDE_STORAGE_KEY, { open: true, lens: "questions" });
        expect(host.saveSettings.mock.calls.length).toBe(saves);

        const again = await open({ kept: { open: true, lens: "questions" } });
        expect(panel(again.content).hasClass("zettelkasten-flow__reader-panel--open")).toBe(true);
        expect(chip(again.content, "Questions").hasClass("is-active")).toBe(true);
        expect(chip(again.content, "Questions").getAttribute("aria-pressed")).toBe("true");
    });

    it("keeps one panel: Alongside and Contents take the same place, and closing it is remembered", async () => {
        const { content, app } = await open();
        alongsideButton(content).click();
        await flush();
        content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Contents")!.click();
        expect(content.byClass("reader-alongside-lenses")).toHaveLength(0);
        expect(app.saveLocalStorage).toHaveBeenLastCalledWith(ALONGSIDE_STORAGE_KEY, { open: false, lens: "all" });
    });
});

describe("Alongside beside a paper (#754 FR-2, FR-3b)", () => {
    afterAll(() => __setPdfJs(null));
    beforeEach(() => {
        installBrowserGlobals();
        resetReaderWorkspace();
    });

    async function openPaper(layout?: string) {
        const pages = [
            { runs: prose(["Seth Gilbert and Nancy Lynch argue that a web service cannot be consistent,", "available and partition tolerant at once."], { top: 700 }) },
            { runs: prose(["In this section we consider the asynchronous network model, in which", "there is no clock at all."]) },
        ];
        const { lib } = makePdfJs({ pages, info: { Title: "Brewer's Conjecture" } });
        __setPdfJs(lib);
        const paper = file("Papers/cap.pdf");
        const born = file("born.md");
        const app = {
            workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
            vault: {
                getAbstractFileByPath: (path: string) => (path === paper.path ? paper : path === "born.md" ? born : null),
                readBinary: async () => new ArrayBuffer(4),
                cachedRead: async () => "",
            },
            metadataCache: {
                getFirstLinkpathDest: () => null,
                on: () => ({}),
                getFileCache: (f: TFile) => (f.path === "born.md" ? { frontmatter: { source: ["[[Papers/cap.pdf#page=1|cap]] p. 1 · “…‹Seth Gilbert and Nancy Lynch›…”"] } } : null),
            },
            loadLocalStorage: () => undefined,
            saveLocalStorage: jest.fn(),
        };
        const content = new DomNode();
        const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
        leaf.detach = jest.fn();
        const model = vault();
        const record = judgements();
        const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) }, {}, {}, { index: { status: "ready", getModel: () => model }, thoughts: async () => [], thoughtFolder: () => "Lab", judgements: record });
        await view.setState({ source: "Papers/cap.pdf", chapter: 0, ...(layout ? { layout } : {}) }, {} as never);
        await view.onOpen();
        await settle(() => content.byClass("reader-next").length > 0 || content.byClass("reader-pv-run").length > 0);
        return { view, content, record };
    }

    it("lists the notes born from this page first, saying the page (FR-3b, FR-4)", async () => {
        const { content } = await openPaper();
        alongsideButton(content).click();
        await flush();
        expect(titles(content)).toContain("Born note");
        expect(why(content, "Born note")).toBe("Born from p. 1");
    });

    it("says You linked it to this passage for an idea you linked in this reading, and only then (#762 FR-8)", async () => {
        const { view, content } = await openPaper();
        alongsideButton(content).click();
        await flush();
        expect(why(content, "Born note")).toBe("Born from p. 1");
        (view as any).alongside.addFromReading({ kind: "link", path: "born.md", title: "Born note" });
        await flush();
        expect(why(content, "Born note")).toBe("You linked it to this passage");
        expect(content.byClass("reader-from-reading-row").map((row) => row.textContent)).toEqual(["Linked to Born note"]);
    });

    it("takes back a claim or a link from its row: Undo, and the row goes (#762)", async () => {
        const { view, content } = await openPaper();
        alongsideButton(content).click();
        await flush();
        let ok = false;
        const undo = jest.fn(async () => ok);
        (view as any).alongside.addFromReading({ kind: "link", path: "born.md", title: "Born note", undo });
        await flush();
        const back = () => content.find((el) => el.getAttribute("data-zf-undo") !== null)!;
        back().click();
        await flush();
        expect(back().textContent).toBe("Could not take it back — the note changed since.");
        ok = true;
        (view as any).alongside.addFromReading({ kind: "claim", path: "A.md", title: "A", undo });
        await flush();
        content.findAll((el) => el.getAttribute("data-zf-undo") !== null)[1].click();
        await flush();
        expect(content.byClass("reader-from-reading-row").map((row) => row.textContent)).toEqual(["Linked to Born note"]);
    });

    it("puts Claim beside an accepted What's the claim in From this reading (#762 FR-1)", async () => {
        const { view, content } = await openPaper();
        alongsideButton(content).click();
        await flush();
        const claim = jest.fn();
        (view as any).alongside.addFromReading({ kind: "thought", path: "Lab/1-t1.md", title: "What's the claim", claim });
        (view as any).alongside.addFromReading({ kind: "claim", path: "A claim.md", title: "A claim" });
        expect(content.byClass("reader-from-reading-row").map((row) => row.textContent)).toEqual(["What's the claim · AI", "Claim: A claim"]);
        const buttons = content.byClass("reader-from-reading-claim");
        expect(buttons.map((b) => b.textContent)).toEqual(["Claim"]);
        buttons[0].click();
        expect(claim).toHaveBeenCalledWith({ left: 0, top: 0, width: 100, height: 100 });
    });

    it("opens the claim sheet in Alongside's panel, opening Alongside for it; Esc takes it, nothing written (#762)", async () => {
        const { view, content } = await openPaper();
        const actions = (view as any).passageActions();
        actions.claim({ quote: { exact: "Seth Gilbert and Nancy Lynch", prefix: "", suffix: "" }, locator: { at: 0, label: "p. 1", chapter: "page:0" } }, { left: 10, top: 10, width: 50, height: 20 });
        await flush();
        const panel = content.byClass("reader-panel")[0];
        expect(panel.hasClass("zettelkasten-flow__reader-panel--open")).toBe(true);
        expect(panel.byClass("reader-claim-sheet")).toHaveLength(1);
        expect(panel.byClass("reader-alongside-lenses")).toHaveLength(1);
        expect(panel.oneByClass("reader-claim-source").textContent).toContain("[[Papers/cap.pdf#page=1|Brewer's Conjecture]]");
        (view as any).escape();
        expect(content.byClass("reader-claim-sheet")).toHaveLength(0);
    });

    it("offers no Claim and no Link in a note reading", async () => {
        const { view } = await openPaper();
        (view as any).sourcePath = null;
        expect((view as any).passageActions()).toBeNull();
    });

    it("rules a note out of this page only, by the book and the page's key", async () => {
        const { content, record } = await openPaper();
        alongsideButton(content).click();
        await flush();
        // The born note is not a tension; rule out from the record directly, as #756's Reject would.
        record.log.push({ at: 1, ...chapterVerdict("born.md", "Papers/cap.pdf", "page:0") });
        content.oneByClass("reader-stage").fire("scroll");
        await new Promise((resolve) => setTimeout(resolve, ALONGSIDE_SETTLE_MS + 30));
        expect(titles(content)).not.toContain("Born note");
    });

    it("is near the page in Page view, and says so (FR-2)", async () => {
        const { content } = await openPaper("page");
        alongsideButton(content).click();
        await flush();
        expect(content.oneByClass("reader-alongside-near").textContent).toBe("Near this page");
    });

    it("offers a note met beside a book in a tab, never as a detour inside the book", async () => {
        const { content } = await openPaper();
        alongsideButton(content).click();
        await flush();
        card(content, "Born note").oneByClass("reader-alongside-title").click();
        await flush();
        expect(content.byClass("reader-peek-action").map((b) => b.textContent)).toEqual(["Open in a new tab", "Close"]);
    });
});

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { makeEpub } from "../../../../support/zipFixture";
import { parseXml } from "../../../../support/miniXml";
import { withTextNodes } from "../../../../support/domText";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const proto = DomNode.prototype as any;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const BOOK = makeEpub({
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    chapters: [
        { id: "c1", href: "text/ch1.xhtml", title: "1 · The characters of the story", body: '<h2>The characters</h2><p>System 1 operates <em>automatically</em>.</p><script>alert(1)</script><p><a href="ch3.xhtml#effort">see chapter 3</a> <a href="https://example.com">a website</a></p>' },
        { id: "c2", href: "text/ch2.xhtml", title: "2 · Attention and effort", body: '<p onclick="steal()" style="color:red">Effort is limited.</p><img src="../images/fig.png" alt="Figure"/>' },
        { id: "c3", href: "text/ch3.xhtml", title: "3 · The lazy controller", body: '<p id="effort">A general law of least effort.</p>' },
    ],
    extra: { "OEBPS/images/fig.png": new Uint8Array([137, 80, 78, 71]) },
});

function mount(bytes: Uint8Array = BOOK) {
    const book = file("Books/tfs.epub");
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
            readBinary: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            cachedRead: async () => "",
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: {} as Record<string, unknown>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    return { view: new ReaderView(leaf, host, { store }), content, host, app };
}

const paragraphs = (content: DomNode) => content.oneByClass("reader-source-body").findAll((el) => el.tag === "p").map((el) => el.textContent);

describe("an EPUB in the Reader (#682)", () => {
    const revoked: string[] = [];
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        // Obsidian's appendText: a text run, drawn here as a span so a test can read it.
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
        let n = 0;
        g.URL.createObjectURL = () => `blob:${++n}`;
        g.URL.revokeObjectURL = (url: string) => revoked.push(url);
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
    });
    beforeEach(() => resetReaderWorkspace());

    async function open(chapter = 0, bytes?: Uint8Array) {
        const m = mount(bytes);
        await m.view.setState({ source: "Books/tfs.epub", chapter }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
        return m;
    }

    it("reads the spine as chapters, named from the book's own contents", async () => {
        const { content } = await open();
        expect(content.oneByClass("reader-path-title").textContent).toBe("Thinking, Fast and Slow · Daniel Kahneman");
        expect(content.oneByClass("reader-count").textContent).toBe("Chapter 1 / 3");
        expect(paragraphs(content)[0]).toBe("System 1 operates automatically.");
        expect(content.oneByClass("reader-next-label").textContent).toBe("Next · 2 · Attention and effort");
    });

    it("never draws what the book would run: no script, no handlers, no style", async () => {
        const { content } = await open(1);
        await settle(() => content.byClass("reader-source-body").length > 0);
        const body = content.oneByClass("reader-source-body");
        expect(body.findAll((el) => el.tag === "script")).toHaveLength(0);
        const p = body.find((el) => el.tag === "p");
        expect(p?.getAttribute("onclick")).toBeNull();
        expect(p?.getAttribute("style")).toBeNull();
        // The figure comes from the archive as an object URL, never from a URL in the book.
        await settle(() => body.find((el) => el.tag === "img")?.getAttribute("src") !== null);
        expect(body.find((el) => el.tag === "img")?.getAttribute("src")).toMatch(/^blob:/);
    });

    it("follows a link inside the book to its chapter, and never one that leaves it", async () => {
        const { content, app } = await open();
        const body = content.oneByClass("reader-source-body");
        const outside = body.find((el) => el.hasClass("zettelkasten-flow__reader-source-outlink"));
        expect(outside?.tag).toBe("span");
        const inside = body.find((el) => el.tag === "a") as DomNode;
        expect(inside.getAttribute("data-zf-href")).toBe("OEBPS/text/ch3.xhtml#effort");
        const event = body.fire("click", { target: inside });
        expect(event.defaultPrevented).toBe(true);
        await settle(() => content.oneByClass("reader-count").textContent === "Chapter 3 / 3");
        expect(content.oneByClass("reader-count").textContent).toBe("Chapter 3 / 3");
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("offers a picture as a snapshot, its own bytes, kept as a fleeting note on this page (#763 FR-2, FR-3)", async () => {
        const book = file("Books/tfs.epub");
        const saved: any[] = [];
        const thought = { id: "snap1", text: "![[Thinking, Fast and Slow ch. 2.png]]", created: "2026-10-12", about: book.path, locator: { at: 1, label: "2 · Attention and effort" } };
        const m = mount();
        const view = new ReaderView(m.view.leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) } as never, { store: { folder: () => "Lab", highlightsAbout: jest.fn(async () => []), write: jest.fn(), save: jest.fn(), discard: jest.fn(), restore: jest.fn() } as never }, {}, {}, {}, {}, {}, {}, {
            save: async (_app, shot, choice) => {
                saved.push({ shot, choice, bytes: Array.from(new Uint8Array(await shot.blob.arrayBuffer())), type: shot.blob.type });
                return { batch: "b1", image: "Attachments/Thinking, Fast and Slow ch. 2.png", thought: thought as never };
            },
        });
        (m.app as any).metadataCache.getFirstLinkpathDest = () => null;
        await view.setState({ source: book.path, chapter: 1 }, {} as never);
        await view.onOpen();
        const content = m.content;
        await settle(() => content.byClass("reader-source-body")[0]?.find((el) => el.tag === "img")?.getAttribute("src") != null);
        const body = content.oneByClass("reader-source-body");
        const img = body.find((el) => el.tag === "img") as DomNode;
        expect(img.getAttribute("data-zf-src")).toBe("OEBPS/images/fig.png");
        body.fire("click", { target: img, clientX: 200, clientY: 300 });
        const offer = content.find((el) => el.tag === "button" && el.textContent === "Snapshot this image")!;
        expect(offer).toBeDefined();
        offer.click();
        await settle(() => content.byClass("reader-snapshot-card").length > 0);
        const card = content.oneByClass("reader-snapshot-card");
        expect(card.oneByClass("reader-snapshot-title").textContent).toBe("Image · 2 · Attention and effort");
        // Nothing written until a choice.
        expect(saved).toHaveLength(0);
        card.find((el) => el.tag === "button" && el.textContent === "Fleeting note")!.click();
        await settle(() => saved.length > 0 && content.byClass("reader-snapshot-status").length > 0);
        // The archive's own bytes, in its own format; named after the book and the chapter.
        expect(saved[0].bytes).toEqual([137, 80, 78, 71]);
        expect(saved[0].type).toBe("image/png");
        expect(saved[0].shot.name).toBe("Thinking, Fast and Slow ch. 2");
        expect(saved[0].shot.citation).toBe("[[Books/tfs.epub#OEBPS/text/ch2.xhtml|Thinking, Fast and Slow]] · 2 · Attention and effort");
        expect(saved[0].choice).toEqual({ kind: "fleeting", locator: { at: 1, label: "2 · Attention and effort", chapter: "OEBPS/text/ch2.xhtml" } });
        expect(content.oneByClass("reader-margin").find((el) => el.getAttribute("data-note") === "snap1")).toBeDefined();
        await view.onClose();
    });

    it("lets a chapter's images go when the page turns", async () => {
        const { content } = await open(1);
        await settle(() => content.oneByClass("reader-source-body").find((el) => el.tag === "img")?.getAttribute("src") !== null);
        const before = revoked.length;
        press(content as never, "ArrowRight");
        await settle(() => content.oneByClass("reader-count").textContent === "Chapter 3 / 3");
        // Once the turn that copies the page has played (#770).
        await settle(() => revoked.length > before, 200, 4000);
        expect(revoked.length).toBeGreaterThan(before);
    });

    it("offers the book's contents, and keeps the place for the Library", async () => {
        const { content, host } = await open();
        content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Contents")?.click();
        expect(content.byClass("reader-toc-name").map((el) => el.textContent)).toEqual([
            "1 · The characters of the story",
            "2 · Attention and effort",
            "3 · The lazy controller",
        ]);
        content.byClass("reader-toc-row")[1].click();
        await settle(() => content.oneByClass("reader-count").textContent === "Chapter 2 / 3");
        expect((host.settings.library as any)["Books/tfs.epub"]).toMatchObject({ chapter: 1, chapters: 3, title: "Thinking, Fast and Slow" });
    });

    it("reads a book written right to left as one, so its pages turn to the left (#753 FR-10)", async () => {
        const rtl = makeEpub({ title: "كتاب", direction: "rtl", chapters: [{ id: "c1", href: "text/ch1.xhtml", title: "١", body: "<p>نص</p>" }] });
        const { view, content } = await open(0, rtl);
        expect((view as any).source.direction).toBe("rtl");
        expect(content.oneByClass("reader-page").getAttribute("dir")).toBe("rtl");
        const { view: ltr, content: ltrContent } = await open();
        expect((ltr as any).source.direction).toBeUndefined();
        expect(ltrContent.oneByClass("reader-page").getAttribute("dir")).toBeNull();
    });

    describe("equations and drawings in a book's page (#770)", () => {
        const MATHML = "http://www.w3.org/1998/Math/MathML";
        const SVG = "http://www.w3.org/2000/svg";
        const SCIENCE = makeEpub({
            title: "A small physics",
            chapters: [
                { id: "c1", href: "text/ch1.xhtml", title: "1 · Before", body: "<p>Words only.</p>" },
                {
                    id: "c2",
                    href: "text/ch2.xhtml",
                    title: "2 · Equations",
                    body:
                        "<p>Inline <math><mfrac><mi>a</mi><mi>b</mi></mfrac></math> here.</p>" +
                        '<math display="block"><msqrt><mn>2</mn></msqrt></math>' +
                        '<svg viewBox="0 0 100 50" width="100" height="50"><circle cx="10" cy="10" r="5"/><line x1="0" y1="0" x2="9" y2="9" stroke="currentColor"/>' +
                        '<text x="20" y="20">Input</text><image href="../images/fig.png" width="10" height="10"/></svg>',
                },
            ],
            extra: { "OEBPS/images/fig.png": new Uint8Array([137, 80, 78, 71]) },
        });
        let undoText: () => void;
        beforeAll(() => {
            // Obsidian's `el.doc`: an equation is made in the chapter's own document.
            Object.defineProperty(proto, "doc", {
                configurable: true,
                get: () => ({
                    // The Reader listens to its document (#754: a selection Alongside follows).
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined,
                    createElementNS: (ns: string, tag: string) => {
                        const el = new DomNode(tag);
                        el.namespaceURI = ns;
                        return el;
                    },
                }),
            });
        });
        afterAll(() => {
            delete proto.doc;
        });
        beforeEach(() => {
            undoText = withTextNodes();
        });
        afterEach(() => undoText());

        it("draws an equation and a drawing in their own namespaces, the drawing's picture from the archive (AC-5)", async () => {
            const { content, app } = await open(1, SCIENCE);
            const body = content.oneByClass("reader-source-body");
            const maths = body.findAll((el) => el.tag === "math");
            expect(maths.map((el) => el.namespaceURI)).toEqual([MATHML, MATHML]);
            expect(maths[1].getAttribute("display")).toBe("block");
            expect(body.find((el) => el.tag === "mfrac")?.namespaceURI).toBe(MATHML);
            const svg = body.find((el) => el.tag === "svg") as DomNode;
            expect(svg.svg).toBe(true);
            expect(svg.namespaceURI).toBe(SVG);
            expect(svg.getAttribute("data-zf-drawing")).toBe("true");
            expect(svg.getAttribute("viewBox")).toBe("0 0 100 50");
            // The label is the drawing's, never loose text on the page.
            expect(body.children.some((el) => el.tag === "#text" && el.text.includes("Input"))).toBe(false);
            expect(svg.find((el) => el.tag === "text")?.textContent).toBe("Input");
            const picture = () => svg.find((el) => el.tag === "image");
            await settle(() => picture()?.getAttribute("href") !== null);
            const url = picture()?.getAttribute("href") ?? "";
            expect(url).toMatch(/^blob:/);
            expect(picture()?.getAttribute("src")).toBeNull();
            press(content as never, "ArrowLeft");
            await settle(() => content.oneByClass("reader-count").textContent === "Chapter 1 / 2");
            await settle(() => revoked.includes(url), 200, 4000);
            expect(revoked).toContain(url);
            // The book is only ever read.
            expect(Object.keys(app.vault).filter((key) => /modify|create|process|delete|rename/i.test(key))).toEqual([]);
        });

        it("finds a word in a drawing's label, and tints the drawing on the page (AC-6)", async () => {
            const { content } = await open(1, SCIENCE);
            content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Search in the book")!.click();
            const input = content.oneByClass("reader-search-input");
            input.value = "input";
            input.fire("input");
            await settle(() => (content.oneByClass("reader-search-count").textContent ?? "").includes("result"));
            expect(content.oneByClass("reader-search-count").textContent).toMatch(/^1 result/);
            input.fire("keydown", { key: "Enter" });
            const svg = content.oneByClass("reader-source-body").find((el) => el.tag === "svg") as DomNode;
            await settle(() => svg.hasClass("zettelkasten-flow__reader-search-foreign"));
            expect(svg.hasClass("zettelkasten-flow__reader-search-foreign")).toBe(true);
            expect(svg.findAll((el) => el.hasClass("zettelkasten-flow__reader-search-hit"))).toHaveLength(0);
            input.fire("keydown", { key: "Escape" });
            expect(svg.hasClass("zettelkasten-flow__reader-search-foreign")).toBe(false);
        });
    });
});

describe("a book opens on its text, and a cover is one page (#808)", () => {
    const PENSAR = makeEpub({
        title: "Pensar en sistemas",
        chapters: [
            { id: "cub", href: "Text/cubierta.xhtml", body: '<h1 title="Cubierta"></h1><div><img src="../Images/cover.jpg" alt=""/></div>' },
            { id: "sin", href: "Text/sinopsis.xhtml", body: "<p>Una sinopsis.</p>" },
            { id: "ded", href: "Text/dedicatoria.xhtml", body: "<h2>Dedicatoria</h2><p>A Dana.</p>" },
            { id: "intro", href: "Text/intro.xhtml", title: "Introducción", body: '<h1 id="start">Introducción</h1><p>La lente de los sistemas.</p>' },
        ],
        guide: [
            { type: "cover", href: "Text/cubierta.xhtml" },
            { type: "text", href: "Text/sinopsis.xhtml" },
        ],
        extra: { "OEBPS/Images/cover.jpg": new Uint8Array([255, 216, 255]) },
    });
    const LANDMARKED = makeEpub({
        chapters: [
            { id: "cub", href: "Text/cubierta.xhtml", body: '<div><img src="../Images/cover.jpg" alt=""/></div>' },
            { id: "sin", href: "Text/sinopsis.xhtml", body: "<p>Una sinopsis.</p>" },
            { id: "intro", href: "Text/intro.xhtml", title: "Introducción", body: '<p id="start">La lente de los sistemas.</p>' },
        ],
        guide: [{ type: "text", href: "Text/sinopsis.xhtml" }],
        landmarks: [{ type: "bodymatter", href: "Text/intro.xhtml#start" }],
        extra: { "OEBPS/Images/cover.jpg": new Uint8Array([255, 216, 255]) },
    });

    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
        g.URL.createObjectURL = () => "blob:cover";
        g.URL.revokeObjectURL = () => undefined;
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
    });
    beforeEach(() => resetReaderWorkspace());

    async function read(bytes: Uint8Array, state: Record<string, unknown> = {}) {
        const m = mount(bytes);
        await m.view.setState({ source: "Books/tfs.epub", ...state }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
        return m;
    }
    const at = (m: { view: ReaderView }) => (m.view as any).index as number;

    it("a first reading opens where the guide says the text begins — past the cover", async () => {
        const m = await read(PENSAR);
        expect(at(m)).toBe(1);
        expect(paragraphs(m.content)[0]).toBe("Una sinopsis.");
    });

    it("the nav's bodymatter landmark wins over the guide", async () => {
        expect(at(await read(LANDMARKED))).toBe(2);
    });

    it("a chapter asked for always wins: chapter 0 is the cover, a resume is its place", async () => {
        expect(at(await read(PENSAR, { chapter: 0 }))).toBe(0);
        expect(at(await read(PENSAR, { chapter: 3 }))).toBe(3);
    });

    it("draws the cover chapter as a cover: no empty heading, one picture, the cover class", async () => {
        const m = await read(PENSAR, { chapter: 0 });
        const body = m.content.oneByClass("reader-source-body");
        expect(body.hasClass("zettelkasten-flow__reader-source-body--cover")).toBe(true);
        expect(body.findAll((el) => el.tag === "h1")).toHaveLength(0);
        expect(body.findAll((el) => el.tag === "img")).toHaveLength(1);
    });

    it("a chapter with words is never a cover", async () => {
        const m = await read(PENSAR, { chapter: 3 });
        expect(m.content.oneByClass("reader-source-body").hasClass("zettelkasten-flow__reader-source-body--cover")).toBe(false);
    });

    it("an untitled chapter goes by its first heading once drawn; its place keeps its label", async () => {
        const m = await read(PENSAR, { chapter: 2 });
        const doc = (m.view as any).source;
        expect(doc.chapters[2].label).toBe("Chapter 3");
        expect(doc.chapters[2].heading).toBe("Dedicatoria");
        expect((m.view as any).sourceLabel(2)).toBe("Dedicatoria");
        expect((m.view as any).locatorOf(2).label).toBe("Chapter 3");
        expect(doc.chapters[3].heading).toBeUndefined();
    });

    it("a book that names no start opens on chapter 0, as before", async () => {
        expect(at(await read(BOOK))).toBe(0);
    });
});

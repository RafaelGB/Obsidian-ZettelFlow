/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component } from "obsidian";
import { DomNode, installBrowserGlobals } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { CitePanel, COPIED_MS, type CiteHost, type CiteRequest } from "architecture/components/core/reader/readerCite";
import { ReaderHighlights, type HighlightStore, type SelectionInfo, type ThinkPassage } from "architecture/components/core/reader/readerHighlights";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import type { CiteForm } from "application/library/citation";

/**
 * **Cite a passage** (#768): the panel, where it is offered, what it copies — and that it writes
 * nothing anywhere.
 */

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BOOK = "Books/Thinking, Fast and Slow.epub";
const PAPER = "Papers/Reference class forecasting.pdf";
const PASSAGE = "A general law of least effort applies to cognitive as well as physical exertion.";
const AT = { left: 200, top: 300, width: 40, height: 20 };

const kahneman = { title: "Thinking, Fast and Slow", author: ["Daniel Kahneman"], year: 2011, publisher: "Farrar, Straus and Giroux" };

function harness(options: { form?: CiteForm; addIt?: boolean } = {}) {
    const host = new DomNode();
    let form: CiteForm = options.form ?? "markdown";
    const copied: string[] = [];
    const saved: CiteForm[] = [];
    const added: [string, string][] = [];
    const view: CiteHost = {
        host: () => host as never,
        form: () => form,
        saveForm: (next) => {
            form = next;
            saved.push(next);
        },
        ...(options.addIt === false ? {} : { addIt: (file: string, field: string) => void added.push([file, field]) }),
        copy: (_host, text) => void copied.push(text),
    };
    const panel = new CitePanel(view);
    const el = () => host.byClass("reader-cite")[0];
    const text = () => el().oneByClass("reader-cite-text").textContent;
    const chip = (form: CiteForm) => el().find((node) => node.attrs?.["data-form"] === form)!;
    const copy = () => el().find((node) => node.attrs?.["data-zf-cite-copy"] !== undefined)!;
    const missing = () => el().oneByClass("reader-cite-missing").textContent;
    return { host, panel, el, text, chip, copy, missing, copied, saved, added, form: () => form };
}

const bookRequest = (over: Partial<CiteRequest> = {}): CiteRequest => ({
    source: { kind: "book", fileTitle: "Thinking, Fast and Slow", details: kahneman },
    file: BOOK,
    chapterKey: "OEBPS/ch03.xhtml",
    place: { chapter: "3 · The lazy controller" },
    passage: PASSAGE,
    from: AT,
    ...over,
});

const paperRequest = (over: Partial<CiteRequest> = {}): CiteRequest => ({
    source: { kind: "paper", fileTitle: "Reference class forecasting", details: { author: ["Bent Flyvbjerg"] } },
    file: PAPER,
    chapterKey: "page:5",
    place: { page: "6" },
    passage: "Partitions are rare",
    from: AT,
    ...over,
});

let motion: AnimationRecord | null = null;
let undoReduced: (() => void) | null = null;

beforeEach(() => {
    installBrowserGlobals();
    jest.useFakeTimers();
});
afterEach(() => {
    motion?.stop();
    motion = null;
    undoReduced?.();
    undoReduced = null;
    jest.useRealTimers();
});

describe("the panel (FR-2, FR-7, FR-8)", () => {
    it("shows the form chosen last, five chips, and exactly the text a form is", () => {
        const h = harness();
        h.panel.show(bookRequest());
        expect(h.el().findAll((node) => node.hasClass("zettelkasten-flow__reader-cite-form")).map((b) => b.textContent)).toEqual(["Markdown", "Inline", "Citation key", "BibTeX", "CSL JSON"]);
        expect(h.chip("markdown").hasClass("is-active")).toBe(true);
        expect(h.text()).toBe(
            `> ${PASSAGE}\n> — Daniel Kahneman, *Thinking, Fast and Slow* (2011), ch. 3 · [[Books/Thinking, Fast and Slow.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]]`
        );
        h.chip("inline").click();
        expect(h.text()).toBe("(Kahneman, 2011, ch. 3)");
        expect(h.chip("inline").hasClass("is-active")).toBe(true);
        expect(h.chip("markdown").hasClass("is-active")).toBe(false);
        // The last form chosen is remembered (FR-2).
        expect(h.saved).toEqual(["inline"]);
        h.panel.close(false);
        h.panel.show(bookRequest());
        expect(h.text()).toBe("(Kahneman, 2011, ch. 3)");
    });

    it("copies exactly what is shown, and only on Copy (FR-7, FR-8, AC-5)", () => {
        const h = harness({ form: "bibtex" });
        const before = bufferedWrites().length;
        h.panel.show(bookRequest());
        h.chip("key").click();
        expect(h.copied).toEqual([]);
        h.copy().click();
        expect(h.copied).toEqual(["[@kahneman2011thinking, ch. 3]"]);
        expect(h.copied[0]).toBe(h.text());
        // Nothing written anywhere: not the book's note, not a note, not the book.
        expect(bufferedWrites().length).toBe(before);
    });

    it("says Copied in place, then Copy again after 1.2 s — no Notice (FR-12)", () => {
        const h = harness();
        h.panel.show(bookRequest());
        h.copy().click();
        expect(h.copy().textContent).toBe("Copied");
        expect(h.copy().hasClass("zettelkasten-flow__reader-cite-copy--done")).toBe(true);
        jest.advanceTimersByTime(COPIED_MS);
        expect(h.copy().textContent).toBe("Copy");
        expect(h.copy().hasClass("zettelkasten-flow__reader-cite-copy--done")).toBe(false);
    });

    it("is not a modal: no backdrop, no aria-modal, a region over the page", () => {
        const h = harness();
        h.panel.show(bookRequest());
        expect(h.el().attrs.role).toBe("region");
        expect(h.el().attrs["aria-modal"]).toBeUndefined();
        expect(h.host.children).toHaveLength(1);
    });

    it("goes on a click outside, on its ×, and on Esc inside it — and stays on a click inside", () => {
        const h = harness();
        h.panel.show(bookRequest());
        h.el().fire("mousedown");
        expect(h.panel.isOpen()).toBe(true);
        // Caught on the way down, so a pane that keeps its clicks to itself still puts it away.
        expect(h.host.listenerOptions.mousedown).toContainEqual({ capture: true });
        h.host.fire("mousedown", { target: h.host });
        expect(h.panel.isOpen()).toBe(false);
        expect(h.host.byClass("reader-cite")).toHaveLength(0);
        h.panel.show(bookRequest());
        h.el().find((node) => node.hasClass("zettelkasten-flow__reader-panel-close"))!.click();
        expect(h.panel.isOpen()).toBe(false);
        h.panel.show(bookRequest());
        const esc = h.el().fire("keydown", { key: "Escape" });
        expect(esc.defaultPrevented).toBe(true);
        expect(h.panel.isOpen()).toBe(false);
    });

    it("titles a whole book's citation as the book", () => {
        const h = harness();
        h.panel.show(bookRequest({ passage: undefined, place: undefined, chapterKey: undefined }));
        expect(h.el().attrs["aria-label"]).toBe("Cite this book");
        expect(h.text()).toBe("— Daniel Kahneman, *Thinking, Fast and Slow* (2011) · [[Books/Thinking, Fast and Slow.epub|Thinking, Fast and Slow]]");
        h.chip("key").click();
        expect(h.text()).toBe("[@kahneman2011thinking]");
    });
});

describe("what is missing, fixed where it lives (FR-4, AC-4)", () => {
    it("names the missing year of a paper, and Add it opens its details at Year", () => {
        const h = harness({ form: "inline" });
        h.panel.show(paperRequest());
        expect(h.text()).toBe("(Flyvbjerg, n.d., p. 6)");
        expect(h.missing()).toBe("No year in this paper's details · Add it");
        h.el().find((node) => node.attrs?.["data-zf-cite-add"] === "year")!.click();
        expect(h.added).toEqual([[PAPER, "year"]]);
        expect(h.panel.isOpen()).toBe(false);
    });

    it("names both when there is no author and no year, the title standing for the author", () => {
        const h = harness({ form: "inline" });
        h.panel.show(paperRequest({ source: { kind: "paper", fileTitle: "Reference class forecasting" } }));
        expect(h.text()).toBe("(Reference class forecasting, n.d., p. 6)");
        expect(h.missing()).toBe("No author or year in this paper's details · Add them");
        h.el().find((node) => node.attrs?.["data-zf-cite-add"] !== undefined)!.click();
        expect(h.added).toEqual([[PAPER, "author"]]);
    });

    it("says nothing when nothing is missing, and offers no Add it for an article", () => {
        const h = harness({ form: "inline" });
        h.panel.show(bookRequest());
        expect(h.missing()).toBe("");
        h.panel.show({ source: { kind: "article", fileTitle: "The web we lost", url: "https://example.com" }, file: "Clippings/The web we lost.md", passage: "x", from: AT });
        expect(h.missing()).toBe("No author or year in this article's details");
        expect(h.el().find((node) => node.attrs?.["data-zf-cite-add"] !== undefined)).toBeUndefined();
    });
});

describe("motion and feel (FR-10 – FR-13, AC-7)", () => {
    it("grows from its anchor, scale and opacity, the fast beat — and shrinks back", () => {
        motion = recordAnimations();
        const h = harness();
        h.panel.show(bookRequest());
        const grow = motion.animations[0];
        expect(grow.target).toBe(h.el());
        expect(grow.keyframes).toEqual([
            { transform: "scale(0.96)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
        ]);
        expect(grow.options.duration).toBe(MOTION.fast);
        expect(Object.keys(h.el().cssProps)).toEqual(expect.arrayContaining(["--zf-cite-x", "--zf-cite-y", "--zf-origin-x", "--zf-origin-y"]));
        const el = h.el();
        h.panel.close();
        const shrink = motion.animations[motion.animations.length - 1];
        expect(shrink.target).toBe(el);
        expect(shrink.keyframes).toEqual([
            { transform: "scale(1)", opacity: 1 },
            { transform: "scale(0.96)", opacity: 0 },
        ]);
        shrink.finish();
        expect(h.host.byClass("reader-cite")).toHaveLength(0);
    });

    it("crossfades the text alone when the form changes: no size, nothing else moves", () => {
        motion = recordAnimations();
        const h = harness();
        h.panel.show(bookRequest());
        const before = motion.animations.length;
        h.chip("bibtex").click();
        const fades = motion.animations.slice(before);
        expect(fades).toHaveLength(1);
        expect(fades[0].target).toBe(h.el().oneByClass("reader-cite-text"));
        expect(fades[0].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
        expect(fades[0].options.duration).toBe(MOTION.fast);
        expect([...motion.keys()].filter((key) => !["transform", "opacity"].includes(key))).toEqual([]);
    });

    it("fades the check in on Copy and out after 1.2 s, by its opacity", () => {
        motion = recordAnimations();
        const h = harness();
        h.panel.show(bookRequest());
        const before = motion.animations.length;
        h.copy().click();
        jest.advanceTimersByTime(COPIED_MS);
        const checks = motion.animations.slice(before);
        expect(checks.map((a) => a.keyframes)).toEqual([[{ opacity: 0 }, { opacity: 1 }], [{ opacity: 1 }, { opacity: 0 }]]);
        expect(checks.every((a) => a.target.hasClass("zettelkasten-flow__reader-cite-check"))).toBe(true);
    });

    it("appears, changes and goes at once under reduced motion", () => {
        motion = recordAnimations();
        undoReduced = reducedMotion(true);
        const h = harness();
        h.panel.show(bookRequest());
        h.chip("inline").click();
        h.copy().click();
        jest.advanceTimersByTime(COPIED_MS);
        h.panel.close();
        expect(motion.animations).toHaveLength(0);
        expect(h.host.byClass("reader-cite")).toHaveLength(0);
    });
});

describe("Cite in the selection popover and a highlight's menu (FR-1, AC-5)", () => {
    function chapter(): FakeEl {
        return new FakeEl("div", [new FakeEl("p", [`It said: ${PASSAGE} And then it went on.`])]);
    }
    function mount(withCite = true) {
        const body = chapter();
        const host = new DomNode();
        let selection: SelectionInfo | null = null;
        const cited: { passage: ThinkPassage; from: unknown }[] = [];
        const thoughts: any[] = [];
        const store = {
            folder: () => "Lab",
            highlightsAbout: jest.fn(async () => thoughts),
            write: jest.fn(),
            save: jest.fn(),
            discard: jest.fn(),
            restore: jest.fn(),
        };
        const highlights = new ReaderHighlights(
            {
                app: {} as never,
                host: host as never,
                owner: new Component(),
                scrollTo: jest.fn(),
                onChange: jest.fn(),
                ...(withCite ? { cite: () => (passage: ThinkPassage, from: unknown) => void cited.push({ passage, from }) } : {}),
            },
            { store: store as unknown as HighlightStore, selection: () => selection, headingAt: () => undefined, copy: jest.fn(),
                makeMark: (id) => {
                    const mark = new FakeEl("mark");
                    mark.attrs["data-hl"] = id;
                    return mark as never;
                },
            }
        );
        const clear = jest.fn();
        const select = (words: string) => {
            const start = chapterText(body as never).indexOf(words);
            selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30, height: 18 }, clear };
        };
        const row = () => host.byClass("reader-hl-actions")[0];
        return { highlights, host, body, select, row, cited, clear, store, thoughts };
    }
    const LOCATOR = { at: 2, label: "3 · The lazy controller", chapter: "OEBPS/ch03.xhtml" };

    it("puts Cite after Copy in the selection popover, and cites the words with their place", async () => {
        jest.useRealTimers();
        const m = mount();
        await m.highlights.attach(m.body as never, BOOK, new Component(), null, LOCATOR);
        m.select(PASSAGE);
        m.body.fire("mouseup");
        const labels = m.row().findAll((el) => el.tag === "button").map((b) => b.textContent);
        expect(labels.indexOf("Cite")).toBe(labels.indexOf("Copy") + 1);
        m.row().find((el) => el.textContent === "Cite")!.click();
        expect(m.highlights.hasPopover()).toBe(false);
        expect(m.cited).toHaveLength(1);
        expect(m.cited[0].passage.quote.exact).toBe(PASSAGE);
        expect(m.cited[0].passage.locator).toEqual(LOCATOR);
        expect(m.clear).toHaveBeenCalled();
        expect(m.store.write).not.toHaveBeenCalled();
        expect(m.store.save).not.toHaveBeenCalled();
    });

    it("offers no Cite where the view has nothing to cite, or the words have no place", async () => {
        jest.useRealTimers();
        const m = mount(false);
        await m.highlights.attach(m.body as never, BOOK, new Component(), null, LOCATOR);
        m.select(PASSAGE);
        m.body.fire("mouseup");
        expect(m.row().findAll((el) => el.tag === "button").map((b) => b.textContent)).not.toContain("Cite");
        const n = mount();
        await n.highlights.attach(n.body as never, "Notes/a.md", new Component(), null, null);
        n.select(PASSAGE);
        n.body.fire("mouseup");
        expect(n.row().findAll((el) => el.tag === "button").map((b) => b.textContent)).not.toContain("Cite");
    });

    it("puts Cite in a highlight's menu, citing its passage", async () => {
        jest.useRealTimers();
        const m = mount();
        m.thoughts.push({
            id: "h1",
            text: "",
            at: 1,
            about: BOOK,
            kind: "highlight",
            quote: { exact: PASSAGE, prefix: "It said: ", suffix: " And then" },
            locator: LOCATOR,
        });
        await m.highlights.attach(m.body as never, BOOK, new Component(), null, LOCATOR);
        const mark = m.body.all("mark")[0];
        expect(mark).toBeDefined();
        mark.fire("click");
        const cite = m.host.byClass("reader-hl-actions")[0]?.find((el) => el.textContent === "Cite");
        expect(cite).toBeDefined();
        cite!.click();
        expect(m.cited).toHaveLength(1);
        expect(m.cited[0].passage.quote.exact).toBe(PASSAGE);
        expect(m.cited[0].passage.highlight?.id).toBe("h1");
    });
});

describe("the Reader's wiring", () => {
    const view = readFileSync(join(ROOT, "src/architecture/components/core/reader/ReaderView.ts"), "utf8");
    const panel = readFileSync(join(ROOT, "src/architecture/components/core/reader/readerCite.ts"), "utf8");

    it("puts the panel away with the footnote: Esc, a click outside, a page turn (FR-10)", () => {
        expect(view).toContain("note: Boolean(this.notePop || this.citePanel?.isOpen()),");
        const closeNote = view.slice(view.indexOf("private closeNote(): void {"));
        expect(closeNote.slice(0, closeNote.indexOf("\n    }\n"))).toContain("this.citePanel?.close();");
        // Another chapter, by a turn past its end or a jump: the panel goes with the one it cited.
        const chapter = view.slice(view.indexOf("private async renderSourceChapter(): Promise<void> {"));
        expect(chapter.slice(0, chapter.indexOf("this.highlights?.reset();"))).toContain("this.citePanel?.close();");
    });

    it("writes nothing: the panel reaches no writer, and touches the clipboard only on Copy (FR-7)", () => {
        for (const writer of ["FileService", "FrontmatterService", "withWriteBatch", ".modify(", ".process(", "processFrontMatter", "vault.create(", "new Notice("]) {
            expect({ writer, found: panel.includes(writer) }).toEqual({ writer, found: false });
        }
        expect(panel.match(/clipboard\?\.writeText\(/g)).toHaveLength(1);
    });
});

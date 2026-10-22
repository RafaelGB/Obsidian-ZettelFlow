import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../../support/dashboardDom";
import { recordAnimations, reducedMotion } from "../../support/motionDom";
import { SourcePicker } from "architecture/components/core/lab/labSourcePicker";
import { renderListHead, renderSourceHead, renderSpine, sourceSubLine } from "architecture/components/core/lab/labSourceHead";
import { LAB_KEY, playSourceShot } from "architecture/components/core/lab/labSourceShot";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import type { LabSource } from "application/thinking/labSource";

const SRC = join(__dirname, "..", "..", "..", "src");
const read = (...path: string[]) => readFileSync(join(SRC, ...path), "utf8");
const LAB = read("architecture", "components", "core", "lab", "LabRenderer.ts");

const BOOK: LabSource = { path: "Books/Thinking in Systems.epub", kind: "book", name: "Thinking in Systems", newest: 30 };
const PDF: LabSource = { path: "Papers/metrics-paper.pdf", kind: "pdf", name: "metrics-paper", newest: 20 };
const NOTE: LabSource = { path: "Notes/Stocks and flows.md", kind: "note", name: "Stocks and flows", newest: 10 };

function picker(sources: LabSource[] = [BOOK, PDF, NOTE]) {
    const host = new DomNode();
    const picked: string[] = [];
    const toggle = jest.fn((path: string) => {
        const at = picked.indexOf(path);
        if (at >= 0) picked.splice(at, 1);
        else picked.push(path);
    });
    const p = new SourcePicker(host as never, { sources: () => sources, picked: () => picked, toggle: (path) => (toggle(path), p.paint()), when: () => "yesterday" });
    const rows = () => host.byClass("lab-source-row");
    // One listener on the rows, as the picker draws them: a click is the rows' own, from a row.
    const press = (row: DomNode) => host.oneByClass("lab-source-rows").fire("click", { target: row });
    return { host, p, picked, toggle, rows, press };
}

describe("From… — the sources, recent first, and never a count (#874 FR-5, AC-9)", () => {
    it("toggles two sources and stays open", () => {
        const m = picker();
        m.p.open();
        expect(m.rows().map((row) => row.getAttribute("data-source"))).toEqual([BOOK.path, PDF.path, NOTE.path]);
        m.press(m.rows()[0]);
        m.press(m.rows()[1]);
        expect(m.toggle).toHaveBeenCalledTimes(2);
        expect(m.p.isOpen()).toBe(true);
        expect(m.rows().filter((row) => row.hasClass("is-active")).map((row) => row.getAttribute("data-source"))).toEqual([BOOK.path, PDF.path]);
        expect(m.rows()[0].getAttribute("aria-selected")).toBe("true");
    });

    it("narrows by name as you type, accents and case aside", () => {
        const m = picker([BOOK, PDF, { ...NOTE, name: "Métricas y flujos" }]);
        m.p.open();
        const field = m.host.oneByClass("lab-source-find");
        field.value = "MET";
        field.fire("input");
        expect(m.rows().map((row) => row.getAttribute("data-source"))).toEqual([PDF.path, NOTE.path]);
    });

    it("writes no number anywhere in it", () => {
        const m = picker();
        m.p.open();
        expect(m.host.oneByClass("lab-source-picker").textContent).not.toMatch(/\d/);
    });

    it("says where sources come from when there are none, and how to narrow when nothing matches", () => {
        const empty = picker([]);
        empty.p.open();
        expect(empty.host.oneByClass("lab-source-empty").textContent).toBe("Thoughts written about a book, a PDF or a note show up here.");
        const m = picker();
        m.p.open();
        const field = m.host.oneByClass("lab-source-find");
        field.value = "zzzz";
        field.fire("input");
        expect(m.rows()).toHaveLength(0);
        expect(m.host.oneByClass("lab-source-empty").textContent).toBe("No source has that name.");
    });

    it("closes, and knows what is inside it", () => {
        const m = picker();
        m.p.toggleOpen();
        const row = m.rows()[0];
        expect(m.p.contains(row as never)).toBe(true);
        m.p.toggleOpen();
        expect(m.p.isOpen()).toBe(false);
        expect(m.host.byClass("lab-source-picker")).toHaveLength(0);
    });
});

describe("the source header (#874 FR-12, AC-13)", () => {
    it("names a book, its author and its kind, and opens it in the Reader", () => {
        const host = new DomNode();
        const open = jest.fn();
        renderSourceHead(host as never, BOOK, { author: "Donella Meadows", gone: false, open, listen: (el, run) => el.addEventListener("click", run) });
        expect(host.oneByClass("lab-source-title").textContent).toBe("Thinking in Systems");
        expect(host.oneByClass("lab-source-sub").textContent).toBe("Donella Meadows · Book");
        const button = host.oneByClass("lab-source-open");
        expect(button.textContent).toBe("Open in the Reader");
        button.click();
        expect(open).toHaveBeenCalledWith(button);
    });

    it("opens a note as a note, and says where it lives", () => {
        const host = new DomNode();
        renderSourceHead(host as never, NOTE, { gone: false, open: jest.fn(), listen: (el, run) => el.addEventListener("click", run) });
        expect(host.oneByClass("lab-source-open").textContent).toBe("Open the note");
        expect(host.oneByClass("lab-source-sub").textContent).toBe("Notes");
        expect(sourceSubLine(PDF)).toBe("PDF");
    });

    it("says a source is gone, and offers nothing to open", () => {
        const host = new DomNode();
        renderSourceHead(host as never, BOOK, { gone: true, open: jest.fn(), listen: (el, run) => el.addEventListener("click", run) });
        expect(host.byClass("lab-source-open")).toHaveLength(0);
        expect(host.oneByClass("lab-source-sub").textContent).toContain("gone");
    });

    it("draws the cover the Library already has, or a plain tile — and never reads the file", () => {
        const host = new DomNode();
        renderSourceHead(host as never, BOOK, { cover: "blob:cover", gone: false, open: jest.fn(), listen: () => undefined });
        expect(host.find((el) => el.tagName === "IMG")?.getAttribute("src")).toBe("blob:cover");
        const head = read("architecture", "components", "core", "lab", "labSourceHead.ts");
        for (const reading of ["readCover", "cachedRead", "vault.read", "openPdf", "openEpub"]) {
            expect({ reading, used: head.includes(reading) }).toEqual({ reading, used: false });
        }
        expect(LAB).toContain("cachedCover(file)");
        expect(LAB).not.toContain("readCover(");
    });
});

describe("the heads in reading order (#874 FR-10)", () => {
    it("names a source, a place in its own words, and the threads with no place", () => {
        const list = new DomNode();
        const source = renderListHead(list as never, { kind: "source", source: BOOK.path }, BOOK, "Donella Meadows");
        const place = renderListHead(list as never, { kind: "place", source: BOOK.path, label: "Ch. 3 · Why systems work" }, BOOK);
        const none = renderListHead(list as never, { kind: "unplaced", source: BOOK.path }, BOOK);
        expect((source as unknown as DomNode).textContent).toContain("Thinking in Systems");
        expect((place as unknown as DomNode).textContent).toBe("Ch. 3 · Why systems work");
        expect((none as unknown as DomNode).textContent).toBe("Not tied to a place");
        // Every head is known across a change, so the shot can move it.
        for (const head of [source, place, none]) expect(head.getAttribute(LAB_KEY)).toMatch(/^head:/);
    });
});

describe("the spine (#874 FR-13, AC-14)", () => {
    it("draws one named tick per place, with no text, placed by a custom property", () => {
        const host = new DomNode();
        const tick = jest.fn();
        const entries = ["a", "b", "c", "d", "e"].map((id, index) => ({ id, share: index / 4, label: `Ch. ${index + 1}` }));
        renderSpine(host as never, entries, { name: BOOK.name, tick, listen: (el, run) => el.addEventListener("click", run) });
        const ticks = host.byClass("lab-spine-tick");
        expect(ticks).toHaveLength(5);
        expect(ticks.map((el) => el.getAttribute("aria-label"))).toEqual(["Ch. 1", "Ch. 2", "Ch. 3", "Ch. 4", "Ch. 5"]);
        for (const el of ticks) expect(el.textContent).toBe("");
        expect(host.oneByClass("lab-spine").getAttribute("aria-label")).toBe("Where you thought in Thinking in Systems");
        ticks[3].click();
        expect(tick).toHaveBeenCalledWith("d");
        const source = read("architecture", "components", "core", "lab", "labSourceHead.ts");
        expect(source).toContain('"--zf-spine-at"');
        expect(source).not.toMatch(/\.style\./);
    });
});

describe("a filter change is one continuous shot (#874 MF-1–MF-11, AC-18)", () => {
    let undo: (() => void)[] = [];
    afterEach(() => {
        for (const fn of undo) fn();
        undo = [];
    });

    function scene() {
        const scroller = new DomNode();
        const list = scroller.createDiv();
        for (const id of ["one", "two", "three"]) list.createDiv({ attr: { [LAB_KEY]: id } });
        return { scroller, list };
    }

    it("moves only transform and opacity, on the shared beats, and the chip waits for its name", () => {
        const record = recordAnimations();
        undo.push(() => record.stop(), reducedMotion(false));
        const { scroller, list } = scene();
        const from = new DomNode();
        const chip = new DomNode();
        const shot = playSourceShot(scroller as never, list as never, () => {
            list.children[2].remove();
            list.createDiv({ attr: { [LAB_KEY]: "four" } });
        }, { chip: { from: from as never, land: () => chip as never } });
        expect(shot).not.toBeNull();
        expect([...record.keys()].sort()).toEqual(["opacity", "transform"]);
        for (const animation of record.animations) expect([MOTION.base, MOTION.fast]).toContain(animation.duration);
        expect(chip.hasClass("zettelkasten-flow__lab-source-chip--landing")).toBe(true);
        // A ghost leaves for the one that went; the one that came slides in.
        expect(scroller.byClass("lab-source-ghost").length).toBeGreaterThanOrEqual(1);
        shot?.finish();
        expect(chip.hasClass("zettelkasten-flow__lab-source-chip--landing")).toBe(false);
        expect(record.animations.every((animation) => animation.playState === "finished")).toBe(true);
    });

    it("is simply made under reduced motion: no animation, the same end state", () => {
        const record = recordAnimations();
        undo.push(() => record.stop(), reducedMotion(true));
        const { scroller, list } = scene();
        const shot = playSourceShot(scroller as never, list as never, () => list.children[0].remove());
        expect(shot).toBeNull();
        expect(record.animations).toHaveLength(0);
        expect(list.children.map((el) => el.getAttribute(LAB_KEY))).toEqual(["two", "three"]);
    });

    it("jumps the shot in flight to its end on the next input", () => {
        expect(LAB).toContain("this.shot?.finish();");
        const onKey = LAB.slice(LAB.indexOf("private onKey("), LAB.indexOf("private run("));
        expect(onKey).toContain("this.shot?.finish();");
        expect(LAB).toContain('this.registerDomEvent(this.container, "pointerdown", () => this.shot?.finish(), { capture: true });');
    });
});

/**
 * The wiring, read off the renderer (the Lab's house style for its own tests: a `LabRenderer` needs
 * seven singletons to stand up, and the parts it delegates to are tested in the DOM above).
 */
describe("Think, filtered by source (#874 FR-3–FR-18)", () => {
    const section = (from: string, to: string) => LAB.slice(LAB.indexOf(from), LAB.indexOf(to));

    it("puts From… and the source chips in the one find bar, and the sources in the one query", () => {
        const bar = section("private renderFindBar(", "private placeClear(");
        expect(bar).toContain('t("lab_source_from")');
        expect(bar).toContain("this.fillSourceChips()");
        expect(bar).toContain("new SourcePicker(bar");
        expect(section("private query(", "private sourceList(")).toContain("sources: this.sources.picked");
    });

    it("makes every from-line a door to its source, and a picked one plain words (FR-4, FR-18)", () => {
        const line = section("private fromLine(", "/** Show only highlights of this meaning");
        expect(line).toContain('t("lab_source_add")');
        expect(line).toContain('t("lab_source_only")');
        expect(line).toContain("this.sources.picked.includes(path)) return parent.createSpan({ text })");
        expect(line).toContain("if (this.readingInOrder()) return place ?");
        for (const door of ["this.fromLine(row, path", 'this.fromLine(meta, about, t("lab_highlight_from"', 'this.fromLine(meta, about, t("lab_move_from"', "source: (meta: HTMLElement, name: string) => void this.fromLine("]) {
            expect({ door, wired: LAB.includes(door) }).toEqual({ door, wired: true });
        }
    });

    it("takes a source away with ✕, Backspace in the empty field, Esc, or Clear (FR-7, FR-8)", () => {
        expect(section("private fillSourceChips(", "private addSource(")).toContain("dropSource(this.sources, path)");
        const bar = section("private renderFindBar(", "private placeClear(");
        expect(bar).toContain('event.key !== "Backspace" || input.value !== "" || this.sources.picked.length === 0');
        expect(bar).toContain("dropLastSource(this.sources)");
        expect(section("private placeClear(", "private query(")).toContain("this.sources = clearSources(this.sources);");
        const leave = section('if (move === "leave") {', 'if (move === "crystallize")');
        // Nearest first: the picker, then the text box you are in, then the sources.
        expect(leave.indexOf("this.closePicker()")).toBeLessThan(leave.indexOf("clearSources(this.sources)"));
        expect(leave).toContain("!writing && this.sources.picked.length > 0");
    });

    it("reads in the source's order before the window, through one row painter (FR-10, FR-16)", () => {
        const paint = section("private paintList(", "/** The scroller neared its foot");
        expect(paint).toContain("readingOrder(found, this.sources.picked)");
        expect(paint.indexOf("readingOrder(")).toBeLessThan(paint.indexOf("windowOf("));
        expect(paint).toContain("this.renderRow(list, index)");
        expect(section("private growList(", "private renderRow(")).toContain("this.renderRow(list, index)");
        expect(section("private renderRow(", "private addSentinel(")).toContain("this.heads.get(index)");
    });

    it("draws the header with one source, the order with any, and the spine for one book or PDF (FR-9, FR-12, FR-13)", () => {
        const region = section("private paintSourceRegion(", "private readingInOrder(");
        expect(region).toContain("picked.length === 1");
        expect(region).toContain('"lab_order_reading"');
        expect(region).toContain('"lab_order_newest"');
        const spine = section("private paintSpine(", "private showThread(");
        expect(spine).toContain('sourceKind(source) !== "note" && this.readingInOrder()');
        expect(spine).toContain("picked.length === 1");
        const show = section("private showThread(", "private fromLine(");
        // A tick past the window grows it by appending — never a redraw that would steal the cursor.
        expect(show).toContain("this.growList()");
        expect(show).not.toContain("this.render()");
        expect(show).toContain('c("lab-source-flash")');
    });

    it("changes the sources in place, inside the shot, keeping the find bar in view (MF-8)", () => {
        const change = section("private changeSources(", "/** With one source, what it is");
        expect(change).toContain("playSourceShot(this.container, list, change");
        expect(change).not.toContain("this.render()");
        expect(change).toContain("this.container.scrollTop = bar.offsetTop");
        expect(change).not.toContain("scrollIntoView");
    });

    it("writes about the one source, drops the banner while a source is on, and dots the calendar by source (FR-14, FR-15, FR-17)", () => {
        expect(LAB).toContain("composerSubject(this.sources.picked, this.about)");
        expect(LAB).toContain('t("lab_source_placeholder"');
        expect(LAB).toContain("if (this.about && !this.colliding && this.sources.picked.length === 0)");
        const calendar = section("private renderCalendar(", "/** A calendar arrow");
        expect(calendar).toContain("this.sources.picked.length > 0 ? roots.flatMap(flattenThread)");
        const jump = section("private jumpToDay(", "private renderComposer(");
        expect(jump).toContain("flattenThread(node).some((thought) => dayKey(thought.at) === key)");
    });

    it("lands filtered when the Reader sends a source (FR-6)", () => {
        expect(LAB).toContain("if (source) this.sources = pickSource(noSources(), source);");
        expect(read("architecture", "components", "core", "surface", "HomeSurfaceView.ts")).toContain('typeof state?.source === "string" ? state.source : undefined');
    });
});

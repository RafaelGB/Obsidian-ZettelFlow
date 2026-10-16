/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Component, TFile } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion } from "../../../../support/motionDom";
import { renderProduced, gatherProduced, PRODUCED_STEP_MS, type ProducedParts } from "architecture/components/core/library/libraryProduced";
import { renderDetail } from "architecture/components/core/library/libraryDetail";
import type { ProducedLists, ProducedThought } from "application/library/produced";
import type { ShelfItem } from "application/library/shelf";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";

const BOOK = "Books/Thinking, Fast and Slow.epub";

const mounted: Component[] = [];
afterEach(() => {
    for (const scope of mounted.splice(0)) scope.unload();
});

const book: ShelfItem = {
    id: BOOK,
    kind: "book",
    format: "epub",
    title: "Thinking, Fast and Slow",
    file: BOOK,
    progress: 0.4,
    highlights: 3,
    born: 1,
    lastRead: 0,
};

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    return f;
}

const note = (path: string) => ({ path, title: (path.split("/").pop() ?? path).replace(/\.md$/, "") });
const mark = (id: string, over: Partial<ProducedThought> = {}): ProducedThought => ({
    id,
    at: 1,
    text: "",
    about: BOOK,
    quote: { exact: `the passage ${id}`, prefix: "", suffix: "" } as never,
    locator: { at: 3, label: "Ch. 4" },
    ...over,
});

function lists(over: Partial<ProducedLists> = {}): ProducedLists {
    return {
        born: [note("Ideas/Note A.md")],
        ideas: [note("Ideas/Risk window.md")],
        links: [{ kind: "pair", a: { kind: "note", ...note("Ideas/Note A.md") }, b: note("Ideas/Planning fallacy.md"), type: "supports" }],
        tensions: [
            { kind: "pair", a: { kind: "note", ...note("Ideas/Older view.md") }, b: note("Ideas/Note A.md"), type: "contradicts" },
            { kind: "challenge", highlight: mark("h3"), thought: { id: "c1", at: 2, text: "Not so sure", about: BOOK } },
        ],
        questions: [note("Questions/Why do plans slip.md")],
        unresolved: [mark("h2", { meaning: "question" })],
        ...over,
    };
}

function mount(answer: ProducedLists | null | (() => ProducedLists | null) = lists(), over: Partial<ProducedParts> = {}) {
    const host = new DomNode();
    const handlers: Record<string, (() => void)[]> = {};
    const below = { openFile: jest.fn(async () => undefined) };
    const split = { openFile: jest.fn(async () => undefined) };
    const home = { setViewState: jest.fn(async () => undefined) };
    const app = {
        workspace: {
            openLinkText: jest.fn(),
            trigger: jest.fn(),
            getLeaf: jest.fn(() => split),
            createLeafBySplit: jest.fn(() => below),
            getLeavesOfType: jest.fn(() => [home]),
            revealLeaf: jest.fn(),
        },
        vault: { getAbstractFileByPath: (path: string) => file(path) },
        metadataCache: {
            on: jest.fn((name: string, fn: () => void) => {
                (handlers[name] ??= []).push(fn);
                return { name };
            }),
        },
    };
    const scope = new Component();
    scope.load();
    mounted.push(scope);
    const open = jest.fn();
    const shown = jest.fn();
    const gather = jest.fn(async () => (typeof answer === "function" ? answer() : answer));
    const section = renderProduced(host as never, { app: app as never, scope, item: book, gather, open, seen: false, shown, ...over }) as unknown as DomNode;
    const resolved = () => (handlers["resolved"] ?? []).forEach((fn) => fn());
    return { host, section, app, open, shown, gather, split, below, home, resolved };
}

const headings = (host: DomNode) => host.byClass("shelf-produced-heading").map((el) => el.textContent);
const rowsOf = (host: DomNode, id: string) => host.findAll((el) => el.getAttribute("data-list") === id)[0].byClass("shelf-produced-row");

describe("what it produced, in the detail (#752 AC-3, FR-6, FR-7)", () => {
    it("draws the lists that have something, in order, with no digit in any heading", async () => {
        const { host } = mount();
        await flush();
        expect(host.oneByClass("shelf-section").textContent).toBe("What it produced in your vault");
        expect(headings(host)).toEqual(["Notes born from it", "Ideas it led to", "Links you made", "Tensions", "Open questions", "Still unresolved"]);
        for (const heading of [...headings(host), host.oneByClass("shelf-section").textContent]) expect(heading).not.toMatch(/\d/);
        expect(rowsOf(host, "links")[0].textContent).toBe("Note A ↔ Planning fallacy · supports");
        expect(rowsOf(host, "tensions").map((row) => row.textContent)).toEqual(["Older view ↔ Note A · contradicts", "the passage h3Not so sure"]);
    });

    it("leaves an empty list out", async () => {
        const { host } = mount(lists({ ideas: [], questions: [] }));
        await flush();
        expect(headings(host)).toEqual(["Notes born from it", "Links you made", "Tensions", "Still unresolved"]);
    });

    it("shows five of seven, then Show all reveals the rest", async () => {
        const seven = Array.from({ length: 7 }, (_, i) => note(`Ideas/Idea ${String.fromCharCode(97 + i)}.md`));
        const { host } = mount(lists({ ideas: seven }));
        await flush();
        expect(rowsOf(host, "ideas")).toHaveLength(5);
        const more = host.oneByClass("shelf-produced-more");
        expect(more.textContent).toBe("Show all");
        more.click();
        expect(rowsOf(host, "ideas")).toHaveLength(7);
        expect(host.byClass("shelf-produced-more")).toHaveLength(0);
    });

    it("draws nothing when nothing came of it yet — no heading, no line of its own (#822)", async () => {
        const { host } = mount(lists({ born: [], ideas: [], links: [], tensions: [], questions: [], unresolved: [] }));
        await flush();
        expect(host.byClass("shelf-produced-list")).toHaveLength(0);
        expect(host.byClass("shelf-section")).toHaveLength(0);
        expect(host.oneByClass("shelf-produced").hasClass("zettelkasten-flow__shelf-detail-quiet")).toBe(true);
    });

    it("waits, quiet, while the model is built, and fills in when it is ready (#822)", async () => {
        let ready = false;
        const { host, resolved, shown } = mount(() => (ready ? lists() : null));
        await flush();
        expect(host.oneByClass("shelf-produced").hasClass("zettelkasten-flow__shelf-detail-quiet")).toBe(true);
        expect(shown).not.toHaveBeenCalled();
        resolved();
        await flush();
        expect(host.byClass("shelf-produced-list")).toHaveLength(0);
        ready = true;
        resolved();
        await flush();
        expect(host.oneByClass("shelf-produced").hasClass("zettelkasten-flow__shelf-detail-quiet")).toBe(false);
        expect(headings(host)[0]).toBe("Notes born from it");
        expect(shown).toHaveBeenCalledTimes(1);
    });

    it("replaces Notes born from it in the detail, and the rest of the detail is usable meanwhile", async () => {
        const aside = new DomNode();
        const scope = new Component();
        mounted.push(scope);
        const open = jest.fn();
        renderDetail(aside as never, { ...book, kind: "path", paths: [], file: undefined } as never, {
            app: { workspace: {} } as never,
            scope,
            cover: (parent) => parent.createDiv(),
            facts: () => undefined,
            scanned: () => undefined,
            lastRead: "never",
            open,
            close: () => undefined,
            produced: (parent) => void renderProduced(parent, { app: { metadataCache: {} } as never, scope, item: book, gather: async () => null, open, seen: false, shown: () => undefined }),
        });
        await flush();
        expect(aside.byClass("shelf-born-list")).toHaveLength(0);
        expect(aside.byClass("shelf-detail-nothing")).toHaveLength(0);
        aside.byText("Open")!.click();
        expect(open).toHaveBeenCalled();
    });
});

describe("each item opens what it names, and nothing is written (#752 AC-4, AC-5)", () => {
    it("a note opens in the editor", async () => {
        const { host, app } = mount();
        await flush();
        rowsOf(host, "born")[0].click();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("Ideas/Note A.md", "", false);
    });

    it("a pair opens in a split beside the detail, which stays where it is", async () => {
        const { host, app, split, below, section } = mount();
        await flush();
        host.scrollTop = 120;
        rowsOf(host, "links")[0].click();
        await flush();
        expect(app.workspace.getLeaf).toHaveBeenCalledWith("split", "vertical");
        expect((split.openFile.mock.calls[0] as any)[0].path).toBe("Ideas/Note A.md");
        expect((below.openFile.mock.calls[0] as any)[0].path).toBe("Ideas/Planning fallacy.md");
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
        expect(section.isConnected).toBe(true);
        expect(host.scrollTop).toBe(120);
    });

    it("a highlight's pair opens its note beside the Library", async () => {
        const { host, split, below } = mount(lists({ links: [{ kind: "pair", a: { kind: "highlight", thought: mark("h2") }, b: note("Ideas/Planning fallacy.md") }] }));
        await flush();
        expect(rowsOf(host, "links")[0].textContent).toBe("“the passage h2” ↔ Planning fallacy");
        rowsOf(host, "links")[0].click();
        await flush();
        expect((split.openFile.mock.calls[0] as any)[0].path).toBe("Ideas/Planning fallacy.md");
        expect(below.openFile).not.toHaveBeenCalled();
    });

    it("a highlight opens in the Reader at its passage", async () => {
        const { host, open } = mount();
        await flush();
        rowsOf(host, "unresolved")[0].click();
        expect(open).toHaveBeenCalledWith({ chapter: 3, highlight: "h2" });
    });

    it("a challenge opens Think on the source", async () => {
        const { host, home } = mount();
        await flush();
        rowsOf(host, "tensions")[1].click();
        await flush();
        expect(home.setViewState).toHaveBeenCalledWith({ type: "zettelflow-home", active: true, state: { mode: "lab", about: BOOK } });
    });

    it("opening it writes nothing", async () => {
        const before = bufferedWrites().length;
        // Every write the plugin can make goes through these two (vaultWriteSeam): none is called.
        const spiesOf = (target: any) =>
            Object.getOwnPropertyNames(target)
                .filter((name) => typeof target[name] === "function" && !["length", "name", "prototype", "constructor"].includes(name))
                .map((name) => jest.spyOn(target, name));
        const fileSpies = spiesOf(FileService);
        const fmSpies = [...spiesOf(FrontmatterService), ...spiesOf(FrontmatterService.prototype)];
        try {
            const { host } = mount();
            await flush();
            host.oneByClass("shelf-produced-row");
            expect(bufferedWrites()).toHaveLength(before);
            for (const spy of [...fileSpies, ...fmSpies]) expect(spy).not.toHaveBeenCalled();
        } finally {
            for (const spy of [...fileSpies, ...fmSpies]) spy.mockRestore();
        }
    });

    it("gathers with reads only: a saved path asks Think, never the model", async () => {
        const store = { thoughtsAbout: jest.fn(async (path: string) => [mark(path, { about: path, locator: undefined })]) };
        const index = { status: "building" as const, getModel: jest.fn() };
        const path: ShelfItem = { id: "path:p", kind: "path", format: "path", title: "p", progress: 0, highlights: 2, born: 0, lastRead: 0, paths: ["b.md", "a.md"] };
        const got = await gatherProduced({} as never, path, { articles: () => [], store, index: index as never });
        expect(got?.unresolved.map((t) => t.id)).toEqual(["b.md", "a.md"]);
        expect(index.getModel).not.toHaveBeenCalled();
        expect(await gatherProduced({} as never, book, { articles: () => [], store, index: index as never })).toBeNull();
    });
});

describe("motion and feel (#752 FR-9 to FR-12)", () => {
    it("the first eight rows fade in and rise 4 px, 30 ms apart; the rest are simply there", async () => {
        const record = recordAnimations();
        try {
            const { host } = mount(lists({ ideas: Array.from({ length: 5 }, (_, i) => note(`Ideas/I${i}.md`)) }));
            await flush();
            const rows = host.byClass("shelf-produced-row");
            expect(rows.length).toBeGreaterThan(8);
            expect(record.animations.map((a) => a.target)).toEqual(rows.slice(0, 8));
            expect(record.animations.map((a) => (a.options as any).delay)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => i * PRODUCED_STEP_MS));
            for (const animation of record.animations) {
                expect(animation.keyframes).toEqual([
                    { opacity: 0, transform: "translateY(4px)" },
                    { opacity: 1, transform: "translateY(0px)" },
                ]);
                expect(animation.options.duration).toBe(250);
            }
        } finally {
            record.stop();
        }
    });

    it("a second opening of the same source starts no animation", async () => {
        const record = recordAnimations();
        try {
            mount(lists(), { seen: true });
            await flush();
            expect(record.animations).toHaveLength(0);
        } finally {
            record.stop();
        }
    });

    it("Show all lets the rest rise in place, and the lists below make room by a translate", async () => {
        const record = recordAnimations();
        try {
            const seven = Array.from({ length: 7 }, (_, i) => note(`Ideas/Idea ${i}.md`));
            const { host } = mount(lists({ ideas: seven }), { seen: true });
            await flush();
            const below = host.findAll((el) => el.getAttribute("data-list") === "links")[0];
            let measured = 0;
            (below as any).getBoundingClientRect = () => ({ left: 0, top: measured++ === 0 ? 200 : 280, width: 100, height: 40 });
            // The detail's highlights, after the section, glide with the lists.
            const highlights = host.createDiv();
            let measuredAfter = 0;
            (highlights as any).getBoundingClientRect = () => ({ left: 0, top: measuredAfter++ === 0 ? 600 : 680, width: 100, height: 40 });
            host.oneByClass("shelf-produced-more").click();
            expect(record.animations.find((a) => a.target === highlights)?.keyframes).toEqual([{ transform: "translate(0px, -80px)" }, { transform: "translate(0px, 0px)" }]);
            const added = rowsOf(host, "ideas").slice(5);
            expect(record.animations.filter((a) => added.includes(a.target)).map((a) => (a.options as any).delay)).toEqual([0, PRODUCED_STEP_MS]);
            const glide = record.animations.find((a) => a.target === below)!;
            expect(glide.keyframes).toEqual([{ transform: "translate(0px, -80px)" }, { transform: "translate(0px, 0px)" }]);
            expect(record.keys().has("height")).toBe(false);
        } finally {
            record.stop();
        }
    });

    it("under reduced motion everything is simply there", async () => {
        const record = recordAnimations();
        const undo = reducedMotion(true);
        try {
            const seven = Array.from({ length: 7 }, (_, i) => note(`Ideas/Idea ${i}.md`));
            const { host } = mount(lists({ ideas: seven }));
            await flush();
            host.oneByClass("shelf-produced-more").click();
            expect(rowsOf(host, "ideas")).toHaveLength(7);
            expect(record.animations).toHaveLength(0);
        } finally {
            undo();
            record.stop();
        }
    });
});

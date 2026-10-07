import { describe, it, expect, jest } from "@jest/globals";
import { Component, Menu } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { HeadBlock } from "architecture/components/core/noteCompanion/blocks/headBlock";
import type {
    CompanionContext,
    CompanionModel,
    CompanionScreen,
} from "architecture/components/core/noteCompanion/blocks/CompanionBlock";
import { lifecycleStepper } from "architecture/knowledge/state";

const openSettings = jest.fn();
jest.mock("architecture/components/core/surface/openSettings", () => ({
    openZettelFlowSettings: (...args: unknown[]) => openSettings(...args),
}));

const model = (over: Partial<CompanionModel> = {}): CompanionModel => ({
    path: "zettel/A.md",
    title: "A",
    vitals: { linksIn: 3, linksOut: 0, claims: 2, sources: 0 },
    steps: lifecycleStepper("literature", true).steps,
    sections: { sections: [], folded: ["tension", "supports", "gaps", "nearby"] },
    next: { kind: "complete" },
    connect: [],
    revision: 1,
    sourceKey: "source",
    linksOut: [],
    ...over,
});

function render(screen: CompanionScreen, pinned = false) {
    const host = new DomNode();
    const block = new HeadBlock(host as never);
    const ctx = {
        app: { workspace: { trigger: jest.fn() } },
        screen,
        pinned,
        owner: new Component(),
        pin: jest.fn(),
        follow: jest.fn(),
        refresh: jest.fn(),
        reveal: jest.fn(),
        open: jest.fn(),
        menu: jest.fn(() => [
            { label: "Trace reasoning paths from this note", icon: "route", onClick: jest.fn() },
            { label: "Share this idea", icon: "image", onClick: jest.fn() },
        ]),
    };
    block.load();
    block.update(ctx as unknown as CompanionContext);
    return { host, ctx, block };
}

describe("the companion head (#640 FR-6..10, AC-4/AC-5)", () => {
    it("names the note, with the full path on hover", () => {
        const { host } = render({ kind: "note", model: model() });
        const title = host.oneByClass("note-companion-title");
        expect(title.textContent).toBe("A");
        expect(title.getAttribute("title")).toBe("zettel/A.md");
    });

    it("reads the vital signs as counts, with zeros faint and no grade anywhere", () => {
        const { host } = render({ kind: "note", model: model() });
        const vitals = host.byClass("note-companion-vital");
        expect(vitals.map((vital) => vital.textContent)).toEqual(["3 links in", "0 links out", "2 claims", "0 sources"]);
        const faint = vitals.filter((vital) => vital.hasClass("zettelkasten-flow__note-companion-vital--zero"));
        expect(faint.map((vital) => vital.textContent)).toEqual(["0 links out", "0 sources"]);
        expect(host.findAll((el) => /%|score|health/i.test(el.text))).toEqual([]);
    });

    it("agrees in number", () => {
        const { host } = render({ kind: "note", model: model({ vitals: { linksIn: 1, linksOut: 1, claims: 1, sources: 1 } }) });
        expect(host.byClass("note-companion-vital").map((vital) => vital.textContent)).toEqual([
            "1 link in",
            "1 link out",
            "1 claim",
            "1 source",
        ]);
    });

    it("opens each count where it is read: links in the neighbourhood (#643), claims and sources in the gaps", () => {
        const { host, ctx } = render({ kind: "note", model: model() });
        const vitals = host.byClass("note-companion-vital");
        expect(vitals.map((vital) => vital.tag)).toEqual(["button", "button", "button", "button"]);
        for (const vital of vitals) vital.click();
        expect(ctx.reveal.mock.calls.map((call) => call[0])).toEqual(["links-in", "links-out", "gaps", "gaps"]);
    });

    it("names the current state at a glance, with its emoji, and only that one", () => {
        const { host } = render({ kind: "note", model: model() });
        const labels = host.byClass("note-companion-step-label").map((label) => label.textContent);
        expect(labels).toEqual(["Fleeting", "📝 Literature", "Permanent"]);
    });

    it("draws the lifecycle as steps you cannot click", () => {
        const { host, ctx } = render({ kind: "note", model: model() });
        const steps = host.querySelector("ol")!.children;
        expect(steps.map((step) => step.getAttribute("aria-current"))).toEqual([null, "step", null]);
        expect(steps.map((step) => [...step.classes].find((cls) => cls.includes("--")))).toEqual([
            "zettelkasten-flow__note-companion-step--done",
            "zettelkasten-flow__note-companion-step--current",
            "zettelkasten-flow__note-companion-step--todo",
        ]);
        for (const step of steps) {
            expect(step.listeners.click ?? []).toEqual([]);
        }
        expect(ctx.open).not.toHaveBeenCalled();
    });

    it("says so when the note has no state yet", () => {
        const { host } = render({ kind: "note", model: model({ steps: lifecycleStepper("fleeting", false).steps }) });
        expect(host.oneByClass("note-companion-no-state").textContent).toBe("No state yet");
    });

    it("pins through the context, and offers a way back when pinned", () => {
        const unpinned = render({ kind: "note", model: model() });
        unpinned.host.oneByClass("note-companion-pin").click();
        expect(unpinned.ctx.pin).toHaveBeenCalled();
        expect(unpinned.host.byClass("note-companion-pinned")).toEqual([]);

        const pinned = render({ kind: "note", model: model() }, true);
        expect(pinned.host.oneByClass("note-companion-pin").hasClass("is-active")).toBe(true);
        pinned.host.oneByClass("note-companion-follow").click();
        expect(pinned.ctx.follow).toHaveBeenCalled();
    });

    it("refreshes from one control", () => {
        const { host, ctx } = render({ kind: "note", model: model() });
        host.oneByClass("note-companion-refresh").click();
        expect(ctx.refresh).toHaveBeenCalledTimes(1);
    });

    it("explains itself when no note is open, and offers the last one", () => {
        const withLast = render({ kind: "empty", last: "zettel/B.md" });
        expect(withLast.host.oneByClass("note-companion-empty").textContent).toContain("Open a note");
        withLast.host.oneByClass("note-companion-last").click();
        expect(withLast.ctx.open).toHaveBeenCalledWith("zettel/B.md");

        const fresh = render({ kind: "empty", last: null });
        expect(fresh.host.byClass("note-companion-last")).toEqual([]);
    });

    it("says what it is doing while the vault indexes", () => {
        const { host } = render({ kind: "indexing", path: "zettel/A.md" });
        expect(host.oneByClass("note-companion-title").textContent).toBe("A");
        expect(host.oneByClass("note-companion-status").textContent).toBe("Indexing your vault…");
    });

    it("makes the proposed next step a control only when the card proposes advancing (#641 FR-15, AC-10)", () => {
        const proposing = render({
            kind: "note",
            model: model({
                next: { kind: "proposing", moves: [{ token: "advance-state", current: "literature", proposed: "permanent" }] },
            }),
        });
        const buttons = proposing.host.querySelector("ol")!.findAll((el) => el.tag === "button");
        expect(buttons.map((button) => button.textContent)).toEqual(["Permanent"]);
        buttons[0].click();
        expect(proposing.ctx.reveal).toHaveBeenCalledWith("next", "advance-state");

        const otherwise = render({ kind: "note", model: model({ next: { kind: "proposing", moves: [{ token: "connect" }] } }) });
        expect(otherwise.host.querySelector("ol")!.findAll((el) => el.tag === "button")).toEqual([]);
    });
});

describe("the ⋯ menu (#642 AC-12, FR-20)", () => {
    it("offers what the blocks add, read when it opens", () => {
        const { host, ctx } = render({ kind: "note", model: model() });
        const more = host.oneByClass("note-companion-more");
        expect(more.getAttribute("aria-haspopup")).toBe("menu");
        expect(more.getAttribute("aria-label")).toBe("More actions");
        more.click();
        expect(ctx.menu).toHaveBeenCalledTimes(1);
        expect(Menu.last!.items.map((item) => item.title)).toEqual(["Trace reasoning paths from this note", "Share this idea"]);
    });

    it("is not there without a note", () => {
        for (const screen of [
            { kind: "empty", last: null },
            { kind: "indexing", path: "a.md" },
            { kind: "error", path: "a.md" },
        ] as CompanionScreen[]) {
            expect(render(screen).host.byClass("note-companion-more")).toEqual([]);
        }
    });

    it("traces reasoning paths from the companion's own note", () => {
        const { block } = render({ kind: "note", model: model() });
        // Read around this note joined the menu with the Reader's paths (#669).
        expect(block.menuItems().map((item) => item.label)).toEqual(["Read around this note", "Trace reasoning paths from this note"]);
        expect(render({ kind: "empty", last: null }).block.menuItems()).toEqual([]);
    });
});

describe("where a note came from (#683)", () => {
    it("names the book and the page a note cites, and opens the Reader there", async () => {
        const { TFile } = await import("obsidian");
        const note = new TFile();
        note.path = "zettel/A.md";
        const book = new TFile();
        book.path = "Books/Thinking, Fast and Slow.epub";
        const host = new DomNode();
        const block = new HeadBlock(host as never);
        const setViewState = jest.fn(async () => undefined);
        const leaf = { setViewState };
        const ctx = {
            app: {
                workspace: { trigger: jest.fn(), getMostRecentLeaf: () => null, getLeavesOfType: () => [], getLeaf: () => leaf, revealLeaf: jest.fn(async () => undefined) },
                vault: {
                    getAbstractFileByPath: (path: string) => (path === note.path ? note : null),
                    cachedRead: async () => "Text.\n\nsource:: [[Books/Thinking, Fast and Slow.epub]] p. 42\nsource:: [[Gone.pdf]] p. 1\n",
                },
                metadataCache: { getFirstLinkpathDest: (link: string) => (link === book.path ? book : null) },
            },
            screen: { kind: "note", model: model() },
            pinned: false,
            owner: new Component(),
            menu: jest.fn(() => []),
        };
        block.load();
        block.update(ctx as unknown as CompanionContext);
        await new Promise((resolve) => setImmediate(resolve));
        expect(host.oneByClass("note-companion-origin-label").textContent).toBe("Born from");
        const source = host.oneByClass("note-companion-origin-source");
        expect(source.textContent).toBe("Thinking, Fast and Slow · p. 42");
        expect(host.oneByClass("note-companion-origin-gone").textContent).toBe("Gone · p. 1");
        source.click();
        await new Promise((resolve) => setImmediate(resolve));
        expect(setViewState).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ source: book.path, chapter: 41 }) }));
    });

    it("says nothing when the note cites no book", async () => {
        const { host } = render({ kind: "note", model: model() });
        await new Promise((resolve) => setImmediate(resolve));
        expect(host.byClass("note-companion-origin")).toHaveLength(0);
    });
});

describe("a note outside ZettelFlow (#688)", () => {
    it("says so calmly, names the rule that left it out and the others, and offers one way out (#713)", () => {
        openSettings.mockClear();
        const { host, ctx } = render({ kind: "outside", path: "Templates/Daily.md", by: "are in Templates and its subfolders", also: ["have the tag #template"] });
        expect(host.oneByClass("note-companion-title").textContent).toBe("Daily");
        expect(host.oneByClass("note-companion-outside-title").textContent).toBe("This note is outside ZettelFlow");
        expect(host.oneByClass("note-companion-outside-by").textContent).toBe("Left out by are in Templates and its subfolders");
        expect(host.oneByClass("note-companion-outside-also").textContent).toBe("Kept out also by have the tag #template");
        expect(host.oneByClass("note-companion-outside-change").textContent).toBe("Change what is left out");
        host.oneByClass("note-companion-outside-change").click();
        expect(openSettings).toHaveBeenCalledWith(ctx.app, "knowledge");
    });

    it("draws no counts, no stepper and no menu for it", () => {
        const { host } = render({ kind: "outside", path: "Templates/Daily.md", by: "are in Templates and its subfolders", also: ["have the tag #template"] });
        expect(host.byClass("note-companion-vital")).toHaveLength(0);
        expect(host.byClass("note-companion-stepper")).toHaveLength(0);
        expect(host.byClass("note-companion-more")).toHaveLength(0);
        expect(host.byClass("note-companion-status")).toHaveLength(0);
    });

    it("keeps the pin, so a pinned note outside can still be let go", () => {
        const { host, ctx } = render({ kind: "outside", path: "Templates/Daily.md", by: "are in Templates and its subfolders", also: ["have the tag #template"] }, true);
        host.oneByClass("note-companion-pin").click();
        expect(ctx.follow).toHaveBeenCalled();
    });
});

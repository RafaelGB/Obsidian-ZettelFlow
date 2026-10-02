import { describe, it, expect, jest } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { HeadBlock } from "architecture/components/core/noteCompanion/blocks/headBlock";
import type {
    CompanionContext,
    CompanionModel,
    CompanionScreen,
} from "architecture/components/core/noteCompanion/blocks/CompanionBlock";
import { lifecycleStepper } from "architecture/knowledge/state";

const model = (over: Partial<CompanionModel> = {}): CompanionModel => ({
    path: "zettel/A.md",
    title: "A",
    vitals: { linksIn: 3, linksOut: 0, claims: 2, sources: 0 },
    steps: lifecycleStepper("literature", true).steps,
    sections: { sections: [], folded: ["tension", "supports", "gaps", "nearby"] },
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
    };
    block.load();
    block.update(ctx as unknown as CompanionContext);
    return { host, ctx };
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

    it("keeps links in/out as plain counts and sends claims and sources to the gaps", () => {
        const { host, ctx } = render({ kind: "note", model: model() });
        const [linksIn, linksOut, claims, sources] = host.byClass("note-companion-vital");
        expect([linksIn.tag, linksOut.tag]).toEqual(["span", "span"]);
        expect([claims.tag, sources.tag]).toEqual(["button", "button"]);
        claims.click();
        sources.click();
        expect(ctx.reveal).toHaveBeenNthCalledWith(1, "gaps");
        expect(ctx.reveal).toHaveBeenNthCalledWith(2, "gaps");
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
});

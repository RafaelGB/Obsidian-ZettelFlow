import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { SectionsBlock } from "architecture/components/core/noteCompanion/blocks/sectionsBlock";
import type {
    CompanionContext,
    CompanionModel,
} from "architecture/components/core/noteCompanion/blocks/CompanionBlock";
import { companionSections, lifecycleStepper, type EvidenceMap } from "architecture/knowledge/state";

const map: EvidenceMap = {
    focus: "A.md",
    supports: [],
    contradicts: ["z/Rival.md"],
    evidence: [],
    gaps: {
        unsourcedClaims: [
            { note: "A.md", claim: "first" },
            { note: "A.md", claim: "second" },
        ],
        openQuestions: ["q/Why.md"],
    },
};
const nearby = [{ path: "old/B.md", basename: "B", reasons: [{ kind: "tag" as const, shared: ["pkm"] }] }];

const model = (path = "A.md", near = nearby): CompanionModel => ({
    path,
    title: path.replace(/\.md$/, ""),
    vitals: { linksIn: 0, linksOut: 0, claims: 2, sources: 0 },
    steps: lifecycleStepper("fleeting", true).steps,
    sections: companionSections({ ...map, focus: path }, near),
});

function setup(deps: Partial<ConstructorParameters<typeof SectionsBlock>[1]> = {}) {
    const host = new DomNode();
    const linkNotes = jest.fn(async () => ({ ok: true, batch: "b1" }));
    const undoBatch = jest.fn(async () => ({ hadWork: true, done: 1, failed: [] }));
    const block = new SectionsBlock(host as never, { linkNotes, undoBatch, ...deps } as never);
    const ctx = (m: CompanionModel) =>
        ({
            app: { workspace: { trigger: jest.fn() } },
            screen: { kind: "note", model: m },
            pinned: false,
            owner: new Component(),
            pin: jest.fn(),
            follow: jest.fn(),
            refresh: jest.fn(),
            reveal: jest.fn(),
            open: jest.fn(),
        }) as unknown as CompanionContext;
    block.load();
    const first = ctx(model());
    block.update(first);
    return { host, block, ctx, first, linkNotes, undoBatch };
}

const summaries = (host: DomNode) => host.querySelectorAll("summary").map((summary) => summary.textContent);

afterEach(() => {
    delete (globalThis as { activeWindow?: unknown }).activeWindow;
});

describe("the counted sections (#640 FR-11..16, AC-6)", () => {
    it("titles each section with its count, in the fixed order", () => {
        const { host } = setup();
        expect(summaries(host)).toEqual(["In tension · 1", "Gaps · 3", "Near and forgotten · 1"]);
    });

    it("says the empty ones once, on one quiet line", () => {
        const { host } = setup();
        expect(host.oneByClass("note-companion-folded").textContent).toBe("No supports");
    });

    it("is only the quiet line when everything is empty", () => {
        const { host, block, ctx } = setup();
        block.update(
            ctx({
                ...model(),
                sections: companionSections(null, []),
            })
        );
        expect(host.querySelectorAll("details")).toEqual([]);
        expect(host.oneByClass("note-companion-folded").textContent).toBe(
            "No tensions · no supports · no gaps · nothing near and forgotten"
        );
    });

    it("has one heading level and no refresh of its own", () => {
        const { host } = setup();
        expect(host.findAll((el) => /^h[1-6]$/.test(el.tag))).toEqual([]);
        expect(host.findAll((el) => /refresh/i.test(el.text) || [...el.classes].some((cls) => cls.includes("refresh")))).toEqual(
            []
        );
    });

    it("opens a row's note and previews it on hover", () => {
        const { host, first } = setup();
        const row = host.oneByClass("note-companion-row-name");
        expect(row.textContent).toBe("Rival");
        expect(row.getAttribute("title")).toBe("z/Rival.md");
        expect(row.getAttribute("role")).toBe("link");
        row.click();
        expect(first.open).toHaveBeenCalledWith("z/Rival.md");
        row.fire("mouseover");
        expect((first.app.workspace.trigger as jest.Mock).mock.calls[0][0]).toBe("hover-link");
    });

    it("lists the gaps: the unsourced claims and the open questions", () => {
        const { host } = setup();
        const gaps = host.byClass("note-companion-section").find((section) => section.getAttribute("data-section") === "gaps")!;
        expect(gaps.textContent).toContain("first");
        expect(gaps.textContent).toContain("second");
        expect(gaps.textContent).toContain("Why");
    });

    it("shows why a note is near", () => {
        const { host } = setup();
        expect(host.oneByClass("note-companion-row-reason").textContent).toContain("#pkm");
    });

    it("links into the companion's note, says so inline, and can be undone (amendment 2)", async () => {
        const { host, linkNotes, undoBatch } = setup();
        host.oneByClass("note-companion-insert").click();
        await flush();
        expect(linkNotes).toHaveBeenCalledWith(expect.anything(), "A.md", "B");
        const status = host.oneByClass("note-companion-link-status");
        expect(status.textContent).toContain("Linked B.");
        host.oneByClass("note-companion-undo").click();
        await flush();
        expect(undoBatch).toHaveBeenCalledWith("b1");
        expect(host.oneByClass("note-companion-link-status").textContent).toBe("Link removed.");
    });

    it("says so inline when the link could not be written", async () => {
        const { host } = setup({ linkNotes: jest.fn(async () => ({ ok: false })) as never });
        host.oneByClass("note-companion-insert").click();
        await flush();
        expect(host.oneByClass("note-companion-link-status").textContent).toBe("Could not add the link.");
        expect(host.byClass("note-companion-undo")).toEqual([]);
    });

    it("remembers what you opened and closed while the view lives", () => {
        const { host, block, ctx } = setup();
        const tension = host.querySelectorAll("details")[0];
        expect(tension.open).toBe(true);
        tension.open = false;
        tension.fire("toggle");
        block.update(ctx(model("C.md")));
        expect(host.querySelectorAll("details")[0].open).toBe(false);
    });
});

describe("a hand-over lands on a section (#640 FR-21, amendment 1)", () => {
    it("claims the section focuses and leaves the next step alone", () => {
        const { block } = setup();
        expect(block.claims("nearby")).toBe(true);
        expect(block.claims("gaps")).toBe(true);
        expect(block.claims("next")).toBe(false);
    });

    it("expands, scrolls to and highlights the section, once", () => {
        const { host, block } = setup();
        const near = () =>
            host.byClass("note-companion-section").find((section) => section.getAttribute("data-section") === "nearby")!;
        near().open = false;
        near().fire("toggle");
        block.reveal("nearby");
        expect(near().open).toBe(true);
        expect(near().scrolls).toEqual([{ behavior: "smooth", block: "start" }]);
        expect(near().hasClass("zettelkasten-flow__note-companion-highlight")).toBe(true);
    });

    it("scrolls without animation when motion is reduced", () => {
        (globalThis as { activeWindow?: unknown }).activeWindow = { matchMedia: () => ({ matches: true }) };
        const { host, block } = setup();
        block.reveal("gaps");
        const gaps = host.byClass("note-companion-section").find((section) => section.getAttribute("data-section") === "gaps")!;
        expect(gaps.scrolls).toEqual([{ behavior: "auto", block: "start" }]);
    });

    it("scrolls to the quiet line when the section is empty", () => {
        const { host, block, ctx } = setup();
        block.update(ctx(model("A.md", [])));
        block.reveal("nearby");
        expect(host.oneByClass("note-companion-folded").scrolls).toHaveLength(1);
    });
});

describe("the stylesheet (#640 FR-7/18, AC-8)", () => {
    const scss = readFileSync(join(__dirname, "../../../../../src/styles/components/noteCompanion.scss"), "utf8");

    it("lays out by the width of the pane, not the window", () => {
        expect(scss).toContain("container-type: inline-size");
        expect(scss).toMatch(/@container[^{]*\(min-width: 37\.5rem\)/);
    });

    it("keeps the head in view and respects reduced motion", () => {
        expect(scss).toContain("position: sticky");
        expect(scss).toContain("prefers-reduced-motion: reduce");
    });

    it("never paints a zero as a warning", () => {
        const zero = scss.slice(scss.indexOf("note-companion-vital--zero"));
        expect(zero.slice(0, zero.indexOf("}"))).not.toMatch(/--color-(red|orange|yellow)|--text-error/);
    });
});

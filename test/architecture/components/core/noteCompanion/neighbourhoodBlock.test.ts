import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { NeighbourhoodBlock } from "architecture/components/core/noteCompanion/blocks/neighbourhoodBlock";
import type {
    CompanionContext,
    CompanionModel,
} from "architecture/components/core/noteCompanion/blocks/CompanionBlock";
import { noteNeighbourhood, noteVitals, type NoteNeighbourhood } from "architecture/knowledge/state";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

const graph = buildModel([
    idea("Hub.md", "permanent", [
        { to: "A.md", type: "supports" },
        { to: "B.md" },
        { to: "C.md", type: "expands" },
    ]),
    idea("A.md", "permanent"),
    idea("B.md", "permanent", [{ to: "Hub.md" }]),
    idea("C.md", "permanent"),
    idea("E.md", "permanent", [{ to: "Hub.md", type: "contradicts" }]),
    idea("Far.md", "permanent"),
]);
const nearby = [{ path: "Far.md", basename: "Far", reasons: [] }];

function model(neighbourhood: NoteNeighbourhood | null = noteNeighbourhood(graph, "Hub.md", nearby)): CompanionModel {
    return {
        path: "Hub.md",
        title: "Hub",
        vitals: noteVitals(graph, "Hub.md"),
        steps: [],
        sections: { sections: [], folded: [] },
        next: { kind: "absent" } as never,
        connect: [],
        revision: 1,
        sourceKey: "source",
        linksOut: [],
        neighbourhood,
    };
}

function setup(view: "graph" | "list" = "graph", m: CompanionModel = model()) {
    const host = new DomNode();
    const block = new NeighbourhoodBlock(host as never);
    const ctx = {
        app: { workspace: { trigger: jest.fn() } },
        screen: { kind: "note", model: m },
        pinned: false,
        owner: new Component(),
        pin: jest.fn(),
        follow: jest.fn(),
        refresh: jest.fn(),
        reveal: jest.fn(),
        open: jest.fn(),
        menu: () => [],
        neighbourhoodView: view,
        setNeighbourhoodView: jest.fn(),
    };
    block.load();
    block.update(ctx as unknown as CompanionContext);
    return { host, block, ctx };
}

const nodes = (host: DomNode) => host.byClass("note-companion-node");
const edge = (host: DomNode, i: number) => host.byClass("note-companion-edge")[i];

describe("the neighbourhood graph (#643 AC-6)", () => {
    it("is drawn as SVG, named for a screen reader", () => {
        const { host } = setup();
        const svg = host.oneByClass("note-companion-graph");
        expect(svg.svg).toBe(true);
        expect(svg.getAttribute("aria-label")).toBe("Neighbourhood of Hub");
    });

    it("draws each neighbour once, best first, then the near ring", () => {
        const { host } = setup();
        // Other typed relations rank above a plain link, even a two-way one (FR-3/6).
        expect(nodes(host).map((n) => n.textContent)).toEqual(["E", "A", "C", "B", "Far"]);
    });

    it("makes every node a focusable link with a full name", () => {
        const { host } = setup();
        const names = nodes(host).map((n) => n.getAttribute("aria-label"));
        expect(names).toEqual([
            "E, Contradicts, links to this note",
            "A, Supports, this note links to it",
            "C, Expands, this note links to it",
            "B, Link, linked both ways",
            "Far, near but not linked",
        ]);
        for (const n of nodes(host)) {
            expect(n.getAttribute("tabindex")).toBe("0");
            expect(n.getAttribute("role")).toBe("link");
        }
    });

    it("colours by relation through classes, and dashes the near ring", () => {
        const { host } = setup();
        expect(nodes(host).map((n) => [...n.classes].find((cls) => cls.includes("--")))).toEqual([
            "zettelkasten-flow__note-companion-node--contradicts",
            "zettelkasten-flow__note-companion-node--supports",
            "zettelkasten-flow__note-companion-node--link",
            "zettelkasten-flow__note-companion-node--link",
            "zettelkasten-flow__note-companion-node--near",
        ]);
    });

    it("never styles inline", () => {
        const { host } = setup();
        expect(host.findAll((el) => el.getAttribute("style") !== null)).toEqual([]);
    });
});

describe("hover, click and keyboard (#643 AC-7)", () => {
    it("lights the node's edge while it is hovered or focused", () => {
        const { host } = setup();
        const node = nodes(host)[1];
        node.fire("mouseenter");
        expect(edge(host, 1).hasClass("is-highlighted")).toBe(true);
        node.fire("mouseleave");
        expect(edge(host, 1).hasClass("is-highlighted")).toBe(false);
        node.fire("focus");
        expect(edge(host, 1).hasClass("is-highlighted")).toBe(true);
        node.fire("blur");
        expect(edge(host, 1).hasClass("is-highlighted")).toBe(false);
    });

    it("previews the note on hover", () => {
        const { host, ctx } = setup();
        nodes(host)[0].fire("mouseover");
        expect(ctx.app.workspace.trigger).toHaveBeenCalledWith("hover-link", expect.objectContaining({ linktext: "E.md" }));
    });

    it("opens on click, in a new tab with a modifier, and with Enter", () => {
        const { host, ctx } = setup();
        nodes(host)[1].click();
        expect(ctx.open).toHaveBeenLastCalledWith("A.md", false);
        nodes(host)[1].click({ ctrlKey: true });
        expect(ctx.open).toHaveBeenLastCalledWith("A.md", "tab");
        nodes(host)[3].fire("keydown", { key: "Enter" });
        expect(ctx.open).toHaveBeenLastCalledWith("B.md", false);
    });
});

describe("hubs (#643 FR-7, AC-4)", () => {
    const hub = buildModel([
        idea("Hub.md", "permanent", Array.from({ length: 20 }, (_, i) => ({ to: `n${String(i).padStart(2, "0")}.md` }))),
        ...Array.from({ length: 20 }, (_, i) => idea(`n${String(i).padStart(2, "0")}.md`, "permanent")),
    ]);

    it("draws twelve and counts the rest, which the list holds", () => {
        const { host, ctx } = setup("graph", model(noteNeighbourhood(hub, "Hub.md", [])));
        expect(nodes(host)).toHaveLength(12);
        const more = host.oneByClass("note-companion-more-links");
        expect(more.textContent).toBe("+8 more notes");
        more.click();
        // A hand-over to the list, not a preference: the saved Graph / List is left alone.
        expect(ctx.setNeighbourhoodView).not.toHaveBeenCalled();
        expect(host.byClass("note-companion-link-group")).toHaveLength(2);
    });

    it("says it in Spanish too", () => {
        const es = readFileSync(join(__dirname, "../../../../../src/architecture/lang/locale/es.ts"), "utf8");
        expect(es).toContain("note_companion_neighbourhood_more: '+{0} notas más'");
    });
});

describe("the list (#643 FR-10/11, AC-8)", () => {
    it("toggles to the list and remembers it", () => {
        const { host, ctx } = setup();
        host.findAll((el) => el.text === "List")[0].click();
        expect(ctx.setNeighbourhoodView).toHaveBeenCalledWith("list");
        expect(host.byClass("note-companion-graph")).toEqual([]);
    });

    it("counts exactly what the head counts", () => {
        const { host } = setup("list");
        const vitals = noteVitals(graph, "Hub.md");
        const [linksIn, linksOut] = host.byClass("note-companion-link-group");
        expect(linksIn.textContent).toContain(`Links in · ${vitals.linksIn}`);
        expect(linksOut.textContent).toContain(`Links out · ${vitals.linksOut}`);
    });

    it("names a typed relation with a chip, and leaves a plain link bare", () => {
        const { host } = setup("list");
        const [, linksOut] = host.byClass("note-companion-link-group");
        expect(linksOut.byClass("note-companion-chip").map((chip) => chip.textContent)).toEqual(["Supports", "Expands"]);
    });

    it("lists a two-way neighbour in both groups", () => {
        const { host } = setup("list");
        const [linksIn, linksOut] = host.byClass("note-companion-link-group");
        expect(linksIn.textContent).toContain("B");
        expect(linksOut.textContent).toContain("B");
    });

    it("opens from the settings the way it was left", () => {
        const { host } = setup("list");
        expect(host.byClass("note-companion-link-group")).toHaveLength(2);
    });
});

describe("never an empty box (#643 AC-9)", () => {
    const lonely = buildModel([idea("Hub.md", "fleeting"), idea("Far.md", "permanent")]);

    it("draws the near ring even with no links", () => {
        const { host } = setup("graph", model(noteNeighbourhood(lonely, "Hub.md", nearby)));
        expect(nodes(host).map((n) => n.textContent)).toEqual(["Far"]);
    });

    it("says so when there is nothing to draw", () => {
        const { host } = setup("graph", model(noteNeighbourhood(lonely, "Hub.md", [])));
        expect(host.oneByClass("note-companion-quiet").textContent).toContain("No links yet");
    });

    it("says so in the list", () => {
        const { host } = setup("list", model(noteNeighbourhood(lonely, "Hub.md", [])));
        expect(host.byClass("note-companion-quiet").map((q) => q.textContent)).toEqual([
            "No note links here yet.",
            "This note links to no note yet.",
        ]);
    });

    it("says it could not read the links, and keeps the rest of the view", () => {
        const { host } = setup("graph", model(null));
        expect(host.oneByClass("note-companion-quiet").textContent).toBe("Could not read this note's links.");
    });
});

describe("the head's link counts land here (#643 decision 4)", () => {
    it("claims the link focuses and nothing else", () => {
        const { block } = setup();
        expect(block.claims("links-in")).toBe(true);
        expect(block.claims("links-out")).toBe(true);
        expect(block.claims("gaps")).toBe(false);
    });

    it("switches to the list and scrolls to that group, without changing the saved view (#639 review)", () => {
        const { host, block, ctx } = setup();
        block.reveal("links-out");
        // Clicking a count is not choosing a preference: only the toggle saves (FR-11).
        expect(ctx.setNeighbourhoodView).not.toHaveBeenCalled();
        const out = host.byClass("note-companion-link-group").find((g) => g.getAttribute("data-group") === "out")!;
        expect(out.scrolls).toHaveLength(1);
        expect(out.hasClass("zettelkasten-flow__note-companion-highlight")).toBe(true);
    });
});

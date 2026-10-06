import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
import { Scope } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { KnowledgeIndex } from "architecture/knowledge";
import { __setMockObsidianApi } from "architecture";
import { AskGraphRenderer } from "architecture/components/core/askGraph/AskGraphRenderer";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

const model = buildModel([
    idea("Zettel/hub.md", "permanent", [{ to: "Zettel/a.md" }, { to: "Zettel/b.md" }], { claims: [{ text: "x" }] }),
    idea("Zettel/a.md", "permanent", [{ to: "Zettel/hub.md" }]),
    idea("Zettel/b.md", "fleeting", [{ to: "Zettel/hub.md" }], { claims: [{ text: "y" }] }),
    idea("Reading/lone.md", "fleeting", []),
]);

let settings: Record<string, unknown>;

function mount(m: KnowledgeModel | null = model, query?: string) {
    jest.spyOn(KnowledgeIndex, "getInstance").mockReturnValue({ status: m ? "ready" : "building", getModel: () => m } as never);
    const host = new DomNode();
    const app = {
        workspace: { openLinkText: jest.fn(async () => undefined), trigger: jest.fn(), on: () => ({}) },
        metadataCache: { on: () => ({}) },
        vault: { on: () => ({}) },
    };
    const explore = new AskGraphRenderer(host as never, app as never, query);
    explore.load();
    const scope = new Scope();
    explore.bindKeys(scope as never);
    const press = (key: string, target: unknown = host) => {
        const evt = { key, target, preventDefault: jest.fn() };
        return scope.handleKey(evt, { modifiers: "", key });
    };
    return { host, app, explore, scope, press };
}

const text = (node: DomNode | undefined) => node?.textContent ?? "";

beforeEach(() => {
    settings = { savedGraphQueries: [], exploreThinkFirst: false };
    __setMockObsidianApi({ ownPlugin: { settings, saveSettings: jest.fn(async () => undefined), registerEvent: () => undefined, register: () => undefined } });
});
afterEach(() => jest.restoreAllMocks());

/**
 * **Explore — ask, and the graph answers** (#696). Jest has no canvas, which is the device with no
 * graph: there the card is the whole answer and opens on every note. Everything else is the same.
 */
describe("Explore with no graph to draw (#696)", () => {
    it("opens the card on every note, and says why there is no graph", () => {
        const { host } = mount();
        expect(host.oneByClass("explore").hasClass("zettelkasten-flow__explore--no-graph")).toBe(true);
        expect(host.oneByClass("explore-card").hasClass("zettelkasten-flow__explore-card--open")).toBe(true);
        expect(text(host.oneByClass("explore-card-number"))).toBe("4");
        expect(host.byClass("explore-card-note")).toHaveLength(1);
        expect(host.byClass("explore-row")).toHaveLength(4);
    });

    it("says it is waiting while the index builds", () => {
        const { host } = mount(null);
        expect(text(host.oneByClass("explore-card-empty"))).toBe("Building the knowledge model…");
    });
});

describe("asking (#696)", () => {
    it("reads a question in words and shows what it understood as chips", () => {
        const { host } = mount();
        const input = host.oneByClass("explore-ask-input");
        input.value = "fleeting notes in Reading";
        input.fire("keydown", { key: "Enter", preventDefault: () => undefined });
        expect(host.byClass("explore-chip-term").map(text)).toEqual(["in Reading/", "fleeting"]);
        expect(text(host.oneByClass("explore-card-number"))).toBe("1");
        expect(text(host.oneByClass("explore-card-unit"))).toBe("note");
    });

    it("says how the answer was found, step by step", () => {
        const { host } = mount(model, "state:permanent AND unsourced");
        const labels = host.byClass("explore-funnel-label").map(text);
        const counts = host.byClass("explore-funnel-count").map(text);
        expect(labels).toEqual(["your vault", "permanent", "Claims without a source"]);
        expect(counts).toEqual(["4", "2", "1"]);
    });

    it("names the term that emptied a zero, and offers nothing that would advise", () => {
        const { host } = mount(model, "state:permanent AND alone");
        expect(text(host.oneByClass("explore-card-empty"))).toBe("Nothing matches. On its own took it from 2 to none.");
    });

    it("flips and removes a chip, and the answer follows", () => {
        const { host } = mount(model, "state:fleeting");
        host.oneByClass("explore-chip-negate").click();
        expect(host.byClass("explore-chip-term").map(text)).toEqual(["not fleeting"]);
        expect(text(host.oneByClass("explore-card-number"))).toBe("2");
        host.oneByClass("explore-chip-remove").click();
        expect(host.byClass("explore-chip")).toHaveLength(0);
    });

    it("narrows by a facet with a click", () => {
        const { host } = mount(model, "state:fleeting");
        const value = host.byClass("explore-facet-value").find((each) => text(each).startsWith("Reading"));
        value?.click();
        expect(host.byClass("explore-chip-term").map(text)).toEqual(["fleeting", "in Reading/"]);
    });

    it("keeps the query as text, under the card, as the escape hatch (§XIII)", () => {
        const { host } = mount(model, "state:fleeting");
        expect(host.oneByClass("explore-text-input").value).toBe("state:fleeting");
    });

    it("opens a note from its row", () => {
        const { host, app } = mount(model, "state:fleeting");
        host.byClass("explore-row-name")[0].click();
        expect(app.workspace.openLinkText).toHaveBeenCalled();
    });

    it("saves a question, and lists it to run again", async () => {
        const { host } = mount(model, "state:fleeting");
        host.oneByClass("explore-save").click();
        await Promise.resolve();
        expect(settings.savedGraphQueries).toEqual([{ query: "state:fleeting" }]);
    });
});

describe("the keys are the leaf's (#696)", () => {
    it("clears the question with Esc, and leaves typing alone", () => {
        const { host, press } = mount(model, "state:fleeting");
        const input = host.oneByClass("explore-ask-input");
        expect(press("f", { tagName: "INPUT" })).toBeUndefined();
        expect(press("Escape")).toBe(false);
        expect(host.byClass("explore-chip")).toHaveLength(0);
        expect(input.value).toBe("");
    });

    it("steps through the answer with the arrows, marks the row, and opens it with Enter", () => {
        const { host, app, press } = mount(model, "state:permanent");
        expect(press("ArrowRight")).toBe(false);
        const active = () => host.byClass("explore-row").filter((row) => row.hasClass("is-active")).map((row) => row.getAttribute("data-path"));
        expect(active()).toEqual(["Zettel/hub.md"]);
        press("ArrowRight");
        expect(active()).toEqual(["Zettel/a.md"]);
        press("Enter");
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("Zettel/a.md", "", false);
        // Esc lets go of the step first, and only then clears the question.
        press("Escape");
        expect(active()).toEqual([]);
        expect(host.byClass("explore-chip")).toHaveLength(1);
    });
});

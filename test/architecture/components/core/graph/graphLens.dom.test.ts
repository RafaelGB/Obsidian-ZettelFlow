import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { KnowledgeIndex } from "architecture/knowledge";
import { GraphLens } from "architecture/components/core/graph/GraphLens";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

function mount(model: KnowledgeModel | null, status = "ready") {
    jest.spyOn(KnowledgeIndex, "getInstance").mockReturnValue({ status, getModel: () => model } as never);
    const host = new DomNode();
    const app = {
        workspace: { openLinkText: jest.fn(async () => undefined), trigger: jest.fn(), on: () => ({}) },
        metadataCache: { on: () => ({}) },
        vault: { on: () => ({}) },
    };
    const lens = new GraphLens(host as never, app as never, null);
    lens.load();
    return { host, app, lens };
}

afterEach(() => jest.restoreAllMocks());

/**
 * **Never a blank view** (#319 S2, #693). Jest has no canvas at all — which is exactly the device the
 * fallback exists for: the same notes become a list, best connected first, each one a button.
 */
describe("the graph without a canvas (#693)", () => {
    const model = buildModel([
        idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }]),
        idea("a.md", "seed", [{ to: "hub.md" }]),
        idea("b.md", "seed", []),
    ]);

    it("becomes a navigable list, hubs first", () => {
        const { host } = mount(model);
        const rows = host.byClass("graph-fallback-row");
        expect(rows).toHaveLength(3);
        expect(rows[0].byClass("graph-fallback-name")[0].textContent).toBe("hub");
        expect(host.byClass("graph-fallback-note")).toHaveLength(1);
    });

    it("opens the note a row names", () => {
        const { host, app } = mount(model);
        host.byClass("graph-fallback-row")[0].click();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("hub.md", "", false);
    });

    it("counts the connections with the right form", () => {
        const { host } = mount(model);
        const metas = host.byClass("graph-fallback-meta").map((el) => el.textContent);
        expect(metas).toContain("1 connection");
        expect(metas).toContain("2 connections");
    });

    it("says it is laying out while the index is not ready", () => {
        const { host } = mount(null, "building");
        expect(host.oneByClass("graph-message").textContent).toBe("Laying out your notes…");
    });

    it("says there is nothing yet in an empty vault", () => {
        const { host } = mount(buildModel([]));
        expect(host.oneByClass("graph-message").textContent).toBe("No notes to show yet.");
    });
});

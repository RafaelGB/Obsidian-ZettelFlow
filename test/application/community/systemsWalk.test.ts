import { describe, it, expect, jest } from "@jest/globals";

jest.mock("architecture/settings/suggesters/FolderSuggest", () => ({ FolderSuggest: class { } }));
jest.mock("application/community/CommunityStepModal", () => ({ CommunityStepModal: class { } }));
jest.mock("application/community/CommunityActionModal", () => ({ CommunityActionModal: class { } }));
jest.mock("application/community/CommunityMarkdownModal", () => ({ CommunityMarkdownModal: class { } }));

import { DomNode } from "../../support/dashboardDom";
import { mountRoom, openCard } from "../../support/systemsRoomHarness";
import { entry, gated } from "../../support/systemsFixtures";

function nodeEl(panel: DomNode, id: string): DomNode {
    return panel.byClass("system-stage")[0].find((el) => el.getAttribute("data-node") === id) as DomNode;
}

function edgeEl(panel: DomNode, id: string): DomNode {
    return panel.byClass("system-stage")[0].find((el) => el.getAttribute("data-edge") === id) as DomNode;
}

describe("try it: the walk, on the drawing (#799 AC-5, FR-8)", () => {
    it("opens in place: a crumb back to Systems, the stage with the whole drawing, and the panel", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Zettelkasten v2");
        expect(panel.oneByClass("system-crumb-back").textContent).toBe("Systems");
        expect(panel.oneByClass("system-stage").byClass("system-node")).toHaveLength(4);
        expect(panel.oneByClass("system-name").text).toBe("Zettelkasten v2");
        expect(panel.oneByClass("system-facts").textContent).toContain("4 steps · 1 branch point");
        expect(panel.oneByClass("system-facts").textContent).toContain("by ZettelFlow");
        expect(mounted.roomEl.oneByClass("systems-list").hasClass("is-hidden")).toBe(true);
    });

    it("stands at the start, asking the step's questions with their options, and lists its exits", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Zettelkasten v2");
        expect(panel.oneByClass("system-walk-at").text).toBe("Capture a Zettel");
        expect(nodeEl(panel, "cap").hasClass("is-current")).toBe(true);
        const asks = panel.byClass("system-ask").map((ask) => ask.textContent);
        expect(asks).toEqual(["Title", "What kind of note is this?FleetingPermanent"]);
        const exits = panel.byClass("system-exit").map((exit) => exit.textContent);
        expect(exits).toEqual(["A fleeting thought→ Fleeting note", "From a source→ Literature note", "My own idea→ Permanent note"]);
    });

    it("takes an exit: the walk moves to its target, which is lit, and the edge taken stays drawn", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Zettelkasten v2");
        panel.byClass("system-exit")[0].click();
        await Promise.resolve();
        expect(panel.oneByClass("system-walk-at").text).toBe("Fleeting note");
        expect(nodeEl(panel, "fleeting").hasClass("is-current")).toBe(true);
        expect(nodeEl(panel, "cap").hasClass("is-current")).toBe(false);
        expect(nodeEl(panel, "cap").hasClass("is-visited")).toBe(true);
        expect(edgeEl(panel, "e1").hasClass("is-taken")).toBe(true);
        expect(edgeEl(panel, "e2").hasClass("is-taken")).toBe(false);
    });

    it("says where the note is created at an end step, and walks again from the start", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Zettelkasten v2");
        panel.byClass("system-exit")[1].click();
        await Promise.resolve();
        const end = panel.oneByClass("system-walk-end");
        expect(end.textContent).toContain("This is where the note is created.");
        expect(panel.oneByClass("system-walk-footer").text).toBe("A rehearsal: nothing is created and nothing is read from your vault.");
        end.byText("Again from the start")!.click();
        expect(panel.oneByClass("system-walk-at").text).toBe("Capture a Zettel");
        expect(edgeEl(panel, "e2").hasClass("is-taken")).toBe(false);
        expect(nodeEl(panel, "literature").hasClass("is-visited")).toBe(false);
    });

    it("offers a gated exit as a choice, and taking it is the answer that opens the gate", async () => {
        const catalog = [entry({ title: "Gated", ref: "/docs/systems/gated.zftemplate", steps: 3, branches: 1 })];
        const mounted = await mountRoom({ catalog: async () => catalog, templates: { "/docs/systems/gated.zftemplate": gated() } });
        const panel = await openCard(mounted, "Gated");
        // Nothing answered yet: both exits are closed by their gates, and both are still offered.
        expect(panel.byClass("system-exit").map((exit) => exit.textContent)).toEqual(["A fleeting thought→ Fleeting note", "From a source→ Literature note"]);
        expect(panel.byClass("system-walk-end")).toHaveLength(0);
        panel.byClass("system-exit")[1].click();
        await Promise.resolve();
        expect(panel.oneByClass("system-walk-at").text).toBe("Literature note");
        expect(edgeEl(panel, "g2").hasClass("is-taken")).toBe(true);
        panel.oneByClass("system-walk-end").byText("Again from the start")!.click();
        expect(panel.oneByClass("system-walk-at").text).toBe("Capture");
        expect(panel.byClass("system-exit")).toHaveLength(2);
    });

    it("walks a single note with no root marked from its only step", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Meeting notes");
        expect(panel.oneByClass("system-walk-at").text).toBe("Meeting notes");
        expect(panel.oneByClass("system-walk-end").textContent).toContain("This is where the note is created.");
        expect(panel.oneByClass("system-walk-end").byText("Again from the start")).toBeUndefined();
    });

    it("reads nothing from the vault and writes nothing, however far it walks", async () => {
        const mounted = await mountRoom({ settings: { ribbonCanvas: "Mine.canvas" } });
        const panel = await openCard(mounted, "Zettelkasten v2");
        panel.byClass("system-exit")[2].click();
        await Promise.resolve();
        panel.oneByClass("system-walk-end").byText("Again from the start")!.click();
        panel.byClass("system-exit")[0].click();
        await Promise.resolve();
        // Changing the role twice is not a write either.
        panel.oneByClass("system-use-current").click();
        panel.byClass("system-use-choice")[2].children.find((el) => el.tag === "input")!.fire("change");
        panel.oneByClass("system-use-current").click();
        panel.byClass("system-use-choice")[0].children.find((el) => el.tag === "input")!.fire("change");
        await mounted.room.close();
        expect(mounted.vaultCalls).toEqual([]);
        expect(mounted.saves).not.toHaveBeenCalled();
        expect(mounted.harness.settings.ribbonCanvas).toBe("Mine.canvas");
        expect(mounted.roomEl.oneByClass("systems-list").hasClass("is-hidden")).toBe(false);
    });
});

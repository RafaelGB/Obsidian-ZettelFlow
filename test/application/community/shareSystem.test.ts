import { describe, it, expect } from "@jest/globals";
import type { TFile } from "obsidian";
import { MAX_PREFILL_URL, newIssueUrl } from "application/community/githubContribute";
import { buildCanvasTemplate, shareCandidate, shareFlow } from "application/community/shareSystem";
import { wireHarness, type FakeVault } from "../../support/harness";

/** A canvas file in the fake vault, named as Obsidian names one. */
function addCanvas(vault: FakeVault, path: string, content: string): TFile {
    const file = vault.add(path, { body: content });
    file.extension = "canvas";
    file.basename = (path.split("/").pop() ?? path).replace(/\.canvas$/, "");
    return file;
}

const CANVAS = JSON.stringify({
    nodes: [
        { id: "a", type: "file", file: "Flows/Steps/Capture.md", x: 0, y: 0, width: 250, height: 60 },
        { id: "b", type: "file", file: "Flows/Steps/Permanent.md", x: 400, y: 0, width: 250, height: 60 },
        { id: "c", type: "text", text: "a note to self", x: 0, y: 200, width: 250, height: 60 },
    ],
    edges: [{ id: "e", fromNode: "a", toNode: "b" }],
});

/**
 * **Today's share output, pinned** (#803 AC-2). These are the assertions the old Contribute panel
 * produced — the prefilled form when the system fits in the URL, a download and the paste-hint form
 * when it does not — held on the flow now that it lives outside React.
 */
describe("sharing a canvas as a system (#803 AC-2)", () => {
    it("bundles the canvas and the notes its file nodes point at, nothing else", async () => {
        const { vault } = wireHarness();
        addCanvas(vault, "Flows/My flow.canvas", CANVAS);
        vault.add("Flows/Steps/Capture.md", { body: "capture" });
        vault.add("Flows/Steps/Permanent.md", { body: "permanent" });
        vault.add("Notes/Unrelated.md", { body: "mine" });
        const built = await buildCanvasTemplate("Flows/My flow.canvas");
        expect(built?.name).toBe("My flow");
        expect(built?.template.canvas).toEqual({ filename: "My flow.canvas", content: CANVAS });
        expect(built?.template.steps).toEqual([
            { filename: "Capture.md", content: "capture" },
            { filename: "Permanent.md", content: "permanent" },
        ]);
        expect(built?.json).toBe(JSON.stringify(built?.template, null, 2));
    });

    it("has nothing to build from a canvas that is not there", async () => {
        wireHarness();
        expect(await buildCanvasTemplate("Nowhere.canvas")).toBeNull();
    });

    it("opens the prefilled ADD_TEMPLATE form when the system fits in the URL", async () => {
        const { vault } = wireHarness();
        addCanvas(vault, "Flows/My flow.canvas", CANVAS);
        const built = (await buildCanvasTemplate("Flows/My flow.canvas"))!;
        const flow = shareFlow(built);
        expect(flow).toEqual({
            open: newIssueUrl("ADD_TEMPLATE.yaml", {
                "template-type": "System",
                description: "System exported from the canvas “My flow”.",
                "json-template": built.json,
            }),
        });
        expect("download" in flow).toBe(false);
        const url = new URL(flow.open);
        expect(url.searchParams.get("template")).toBe("ADD_TEMPLATE.yaml");
        expect(url.searchParams.get("json-template")).toBe(built.json);
    });

    it("downloads an oversized system and opens the form with the paste hint", () => {
        const json = "x".repeat(MAX_PREFILL_URL + 1);
        expect(shareFlow({ name: "Huge", json })).toEqual({
            download: { name: "Huge", json },
            open: newIssueUrl("ADD_TEMPLATE.yaml", {
                "template-type": "System",
                description:
                    "Your system was too large to prefill. Open the downloaded .zftemplate file and paste its contents into the JSON field below.",
            }),
        });
    });
});

describe("which canvas would be shared (#803 FR-2, FR-3)", () => {
    const all = () => true;

    it("is the canvas last focused in this window", () => {
        expect(shareCandidate({ focused: "A/Focused.canvas", ribbon: "B/Ribbon.canvas" }, all)).toBe("A/Focused.canvas");
    });

    it("falls back to the creation flow", () => {
        expect(shareCandidate({ focused: null, ribbon: "B/Ribbon.canvas" }, all)).toBe("B/Ribbon.canvas");
        expect(shareCandidate({ focused: "A/Gone.canvas", ribbon: "B/Ribbon.canvas" }, (path) => path !== "A/Gone.canvas")).toBe("B/Ribbon.canvas");
    });

    it("is nothing with neither, or with only paths that are not canvases in the vault", () => {
        expect(shareCandidate({ focused: null, ribbon: undefined }, all)).toBeNull();
        expect(shareCandidate({ focused: "A/note.md", ribbon: "" }, all)).toBeNull();
        expect(shareCandidate({ focused: "A/x.canvas", ribbon: "B/y.canvas" }, () => false)).toBeNull();
    });
});

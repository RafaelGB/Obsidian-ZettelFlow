import { describe, it, expect, beforeAll, jest } from "@jest/globals";

// The extensions' import chain reaches the canvas patcher and its ESM-only JSONC parser.
jest.mock("tiny-jsonc", () => ({ __esModule: true, default: { parse: JSON.parse } }));
// `architecture/plugin` is the suite-wide stand-in; a node's inline config is JSON, read as such
// (the mock's YAML reader only knows flat maps).
jest.mock("architecture/plugin", () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ...jest.requireActual<object>("../../../__mocks__/architecture-plugin"),
    YamlService: { instance: (config: string) => ({ getZettelFlowSettings: () => JSON.parse(config) }) },
}));

import { DomNode } from "../../../support/dashboardDom";
import { CanvasDock } from "architecture/plugin/canvas/extensions/utils/CanvasDock";
import WorkflowLegibilityExtension from "architecture/plugin/canvas/extensions/WorkflowLegibilityExtension";
import RehearsalExtension from "architecture/plugin/canvas/extensions/RehearsalExtension";
import CanvasHelper from "architecture/plugin/canvas/extensions/utils/CanvasHelper";

/**
 * **What ZettelFlow draws on the canvas** (#686, epic #676): one corner dock instead of three
 * chips, badges as icon chips at the node's foot, accents you can see, IF labels that read as a
 * condition, and the rehearsal as a stepper. Everything is a child we own and remove again.
 */

function detached(make: (host: DomNode) => DomNode): DomNode {
    const el = make(new DomNode());
    el.parent = null;
    return el;
}

beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    g.createEl = (tag: string, options?: unknown) => detached((host) => host.createEl(tag, options));
    g.createSpan = (options?: unknown) => detached((host) => host.createSpan(options));
    g.createDiv = (options?: unknown) => detached((host) => host.createDiv(options));
});

describe("one corner dock: Legend · Review · Rehearse (#686)", () => {
    const tabsOf = (wrapper: DomNode) =>
        wrapper.byClass("canvas-dock-tab").map((tab) => tab.textContent);

    it("puts every panel in one dock, in its order, whatever order they arrive in", () => {
        const wrapper = new DomNode();
        const dock = CanvasDock.of(wrapper as never);
        dock.panel("rehearse", "Rehearse", 2);
        dock.panel("legend", "Legend", 0);
        dock.panel("review", "Review", 1);
        expect(CanvasDock.of(wrapper as never)).toBe(dock);
        expect(wrapper.byClass("canvas-dock")).toHaveLength(1);
        expect(tabsOf(wrapper)).toEqual(["Legend", "Review", "Rehearse"]);
    });

    it("opens one panel at a time, and folds to its row of tabs", () => {
        const wrapper = new DomNode();
        const dock = CanvasDock.of(wrapper as never);
        const opened: string[] = [];
        const legend = dock.panel("legend", "Legend", 0, { onOpen: () => opened.push("legend"), onClose: () => opened.push("-legend") });
        const review = dock.panel("review", "Review", 1);
        const dockEl = wrapper.oneByClass("canvas-dock");
        expect(dockEl.classes.has("zettelkasten-flow__canvas-dock-folded")).toBe(true);

        wrapper.byClass("canvas-dock-tab")[0].click();
        expect(legend.body.hidden).toBe(false);
        expect(review.body.hidden).toBe(true);
        expect(dockEl.classes.has("zettelkasten-flow__canvas-dock-folded")).toBe(false);

        wrapper.byClass("canvas-dock-tab")[1].click();
        expect(legend.body.hidden).toBe(true);
        expect(review.body.hidden).toBe(false);

        wrapper.oneByClass("canvas-dock-fold").click();
        expect(review.body.hidden).toBe(true);
        expect(dockEl.classes.has("zettelkasten-flow__canvas-dock-folded")).toBe(true);
        expect(opened).toEqual(["legend", "-legend"]);
    });

    it("carries a count on a tab, or a check when there is nothing to report", () => {
        const wrapper = new DomNode();
        const review = CanvasDock.of(wrapper as never).panel("review", "Review", 1);
        review.setCount(2);
        expect(wrapper.oneByClass("canvas-dock-count").textContent).toBe("2");
        review.setCount(0);
        const clean = wrapper.oneByClass("canvas-dock-count");
        expect(clean.classes.has("zettelkasten-flow__canvas-dock-count-clean")).toBe(true);
        expect(clean.getAttribute("data-icon")).toBe("check");
    });

    it("leaves nothing behind when its last panel goes", () => {
        const wrapper = new DomNode();
        const dock = CanvasDock.of(wrapper as never);
        const legend = dock.panel("legend", "Legend", 0);
        const review = dock.panel("review", "Review", 1);
        legend.remove();
        expect(wrapper.byClass("canvas-dock")).toHaveLength(1);
        review.remove();
        expect(wrapper.byClass("canvas-dock")).toHaveLength(0);
        expect(wrapper.children).toHaveLength(0);
    });
});

describe("a node says what it does, where you can see it (#686)", () => {
    const plugin = {
        app: { workspace: { on: () => ({}) }, vault: { getAbstractFileByPath: () => null }, metadataCache: {} },
        settings: {},
        registerEvent: () => undefined,
        register: () => undefined,
    };

    function nodeWith(config: object) {
        const nodeEl = new DomNode();
        nodeEl.createDiv({ cls: "canvas-node-container" });
        return {
            nodeEl,
            getData: () => ({ id: "n", type: "text", zettelflowConfig: JSON.stringify(config) }),
        };
    }

    function style(nodes: ReturnType<typeof nodeWith>[], edges: unknown[] = []) {
        jest.spyOn(CanvasHelper, "isCanvasFlow").mockReturnValue(true);
        const ext = new WorkflowLegibilityExtension(plugin as never);
        (ext as unknown as { applyStyling: (canvas: unknown) => void }).applyStyling({
            nodes: new Map(nodes.map((node, i) => [String(i), node])),
            edges: new Map(edges.map((edge, i) => [String(i), edge])),
        });
        return ext;
    }

    it("draws badges as icon chips at the node's foot, the count said with its singular", () => {
        const node = nodeWith({ root: true, actions: [{ hasUI: true }] });
        style([node]);
        const chips = node.nodeEl.oneByClass("node-badges").byClass("node-badge");
        expect(chips.map((chip) => chip.textContent)).toEqual(["Starts the flow", "1 question"]);
        expect(chips.map((chip) => chip.oneByClass("node-badge-icon").getAttribute("data-icon"))).toEqual([
            "flag",
            "message-circle-question",
        ]);
    });

    it("draws WAIT as a bar above Obsidian's container, not an inset shadow under it", () => {
        const node = nodeWith({ wait: { mode: "confirm" } });
        style([node]);
        const last = node.nodeEl.children[node.nodeEl.children.length - 1];
        // The accent comes after the container, so it paints over it.
        expect(node.nodeEl.children[0].classes.has("canvas-node-container")).toBe(true);
        expect(node.nodeEl.byClass("node-accent-wait")).toHaveLength(1);
        expect(node.nodeEl.children.indexOf(node.nodeEl.oneByClass("node-accent"))).toBeGreaterThan(0);
        void last;
    });

    it("marks an IF edge's label with a filter icon, and takes every child back off", () => {
        const wrapperEl = new DomNode();
        wrapperEl.createDiv({ cls: "canvas-path-label", text: "if: type === literature" });
        const node = nodeWith({ root: true, actions: [] });
        const ext = style([node], [{ label: "if: type === literature", labelElement: { wrapperEl } }]);
        expect(wrapperEl.children[0].classes.has("zettelkasten-flow__edge-if-icon")).toBe(true);

        (ext as unknown as { clearStyled: () => void }).clearStyled();
        expect(wrapperEl.byClass("edge-if-icon")).toHaveLength(0);
        expect(node.nodeEl.byClass("node-badges")).toHaveLength(0);
        expect(node.nodeEl.children).toHaveLength(1);
    });
});

describe("the rehearsal reads as a path (#686)", () => {
    it("shows the steps walked, the one you stand on, and what is next", () => {
        const plugin = { app: { workspace: { on: () => ({}) } }, registerEvent: () => undefined, register: () => undefined };
        const ext = new RehearsalExtension(plugin as never);
        const body = new DomNode();
        const flow = { steps: [{ id: "a", label: "Capture an idea" }, { id: "b", label: "Classify" }] };
        (ext as unknown as { renderStepper: (b: unknown, f: unknown, s: unknown) => void }).renderStepper(
            body,
            flow,
            { path: ["a", "b"], currentId: "b", done: false }
        );
        const steps = body.byClass("rehearsal-step");
        expect(steps.map((step) => step.oneByClass("rehearsal-step-name").textContent)).toEqual([
            "Capture an idea",
            "Classify",
            "…",
        ]);
        expect(steps[0].classes.has("zettelkasten-flow__rehearsal-step-done")).toBe(true);
        expect(steps[1].classes.has("zettelkasten-flow__rehearsal-step-current")).toBe(true);
        expect(steps[1].byText("You are here")).toBeDefined();
        expect(steps[2].byText("Depends on what you choose")).toBeDefined();
    });
});

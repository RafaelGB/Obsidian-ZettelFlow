import { describe, it, expect } from "@jest/globals";
import { FlowImpl } from "architecture/plugin/canvas/Flows";
import type { CanvasData } from "obsidian/canvas";
import type { TFile } from "obsidian";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Unit tests for the pure graph-traversal logic of `FlowImpl`.
 *
 * Scope: only `text`/`group` nodes are used in the fixtures. `file` nodes are
 * resolved through an `await FileService.getFile(...)` inside a fire-and-forget
 * `forEach(async …)` callback, so they are pushed after the method already
 * returned (a latent bug documented in the spec) and would also touch the
 * Obsidian runtime. Keeping fixtures to text/group nodes exercises the real,
 * deterministic branches without a running app.
 */

const fakeFile = { path: "flow.canvas", basename: "flow" } as unknown as TFile;

/** A text node whose YAML config decides whether it is a root. */
function textNode(
  id: string,
  opts: { root?: boolean; label?: string; color?: string } = {}
): any {
  const { root, label, color } = opts;
  const configLines: string[] = [];
  if (root !== undefined) configLines.push(`root: ${root}`);
  if (label !== undefined) configLines.push(`label: ${label}`);
  return {
    id,
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    text: "",
    color,
    // Undefined config makes YamlService default to { root: true }.
    zettelflowConfig: configLines.length > 0 ? configLines.join("\n") : undefined,
  };
}

function edge(id: string, fromNode: string, toNode: string, label?: string): any {
  return { id, fromNode, toNode, label };
}

function canvas(nodes: any[], edges: any[] = []): CanvasData {
  return { nodes, edges } as unknown as CanvasData;
}

describe("FlowImpl", () => {
  describe("rootNodes", () => {
    it("returns text nodes flagged root (via YAML `root: true`) and excludes non-root ones", async () => {
      const data = canvas([
        textNode("root-explicit", { root: true }),
        textNode("child", { root: false }),
        textNode("root-implicit"), // no config → YamlService defaults to root:true
      ]);
      const flow = new FlowImpl(data, fakeFile);

      const roots = await flow.rootNodes();

      const ids = roots.map((n) => n.id).sort();
      expect(ids).toEqual(["root-explicit", "root-implicit"]);
      expect(roots.every((n) => n.root === true)).toBe(true);
    });

    it("returns an empty list when no node is a root", async () => {
      const data = canvas([
        textNode("a", { root: false }),
        textNode("b", { root: false }),
      ]);
      const flow = new FlowImpl(data, fakeFile);

      expect(await flow.rootNodes()).toEqual([]);
    });

    it("ignores incoming/outgoing edges when deciding roots (root is a flag, not topology)", async () => {
      // 'a' is flagged root but has an incoming edge; 'b' is not root though it has none.
      const data = canvas(
        [textNode("a", { root: true }), textNode("b", { root: false })],
        [edge("e1", "b", "a")]
      );
      const flow = new FlowImpl(data, fakeFile);

      const ids = (await flow.rootNodes()).map((n) => n.id);
      expect(ids).toEqual(["a"]);
    });

    it("populates the color from the node (default when none is set)", async () => {
      const data = canvas([textNode("r", { root: true })]);
      const flow = new FlowImpl(data, fakeFile);

      const [root] = await flow.rootNodes();
      expect(root.color).toBe("var(--embed-background)");
      expect(root.type).toBe("text");
    });
  });

  describe("childrensOf", () => {
    it("returns the nodes reachable by outgoing edges from the given node", async () => {
      const data = canvas(
        [textNode("A"), textNode("B"), textNode("C")],
        [edge("e1", "A", "B"), edge("e2", "A", "C")]
      );
      const flow = new FlowImpl(data, fakeFile);

      const children = await flow.childrensOf("A");
      expect(children.map((n) => n.id).sort()).toEqual(["B", "C"]);
    });

    it("is directional: edge A→B makes B a child of A but not A a child of B", async () => {
      const data = canvas(
        [textNode("A"), textNode("B")],
        [edge("e1", "A", "B")]
      );
      const flow = new FlowImpl(data, fakeFile);

      expect((await flow.childrensOf("A")).map((n) => n.id)).toEqual(["B"]);
      expect(await flow.childrensOf("B")).toEqual([]);
    });

    it("carries the edge label onto the child node as its tooltip", async () => {
      const data = canvas(
        [textNode("A"), textNode("B")],
        [edge("e1", "A", "B", "go to B")]
      );
      const flow = new FlowImpl(data, fakeFile);

      const [child] = await flow.childrensOf("A");
      expect(child.id).toBe("B");
      expect(child.tooltip).toBe("go to B");
    });

    it("returns an empty list for a node with no outgoing edges", async () => {
      const data = canvas([textNode("A"), textNode("B")], [edge("e1", "A", "B")]);
      const flow = new FlowImpl(data, fakeFile);

      expect(await flow.childrensOf("B")).toEqual([]);
    });

    it("skips edges that point to link nodes (excluded from the node map by the constructor)", async () => {
      const linkNode: any = {
        id: "L",
        type: "link",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        url: "https://example.com",
      };
      const data = canvas(
        [textNode("A"), textNode("B"), linkNode],
        [edge("e1", "A", "B"), edge("e2", "A", "L")]
      );
      const flow = new FlowImpl(data, fakeFile);

      // Only B is resolvable; the link target L is not in the node map.
      expect((await flow.childrensOf("A")).map((n) => n.id)).toEqual(["B"]);
    });

    it("resolves group children by geometry (nodes contained inside the group's bounds)", async () => {
      const group: any = {
        id: "G",
        type: "group",
        x: 0,
        y: 0,
        width: 500,
        height: 500,
        label: "Group",
      };
      const inside = textNode("inside");
      inside.x = 100;
      inside.y = 100;
      inside.width = 50;
      inside.height = 50;
      const outside = textNode("outside");
      outside.x = 1000;
      outside.y = 1000;

      const data = canvas([group, inside, outside]);
      const flow = new FlowImpl(data, fakeFile);

      const children = await flow.childrensOf("G");
      expect(children.map((n) => n.id)).toEqual(["inside"]);
      expect(children[0].tooltip).toBe("Child of Group");
    });
  });
});

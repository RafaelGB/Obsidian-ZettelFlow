import { describe, it, expect, beforeEach } from "@jest/globals";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { buildScene } from "architecture/components/core/graph/graphScene";
import { forgetLayouts, layoutKey, recallLayout, rememberLayout, warmStart } from "architecture/components/core/graph/layoutCache";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

const chain = (names: string[]) =>
    buildScene(build3DGraph(buildModel(names.map((name, i) => idea(`${name}.md`, "seed", i + 1 < names.length ? [{ to: `${names[i + 1]}.md` }] : [])))));

/**
 * **Where the notes were** (#694): reopening Explore on an unchanged vault is instant, and a vault
 * that changed a little starts from where it was.
 */
describe("the layout cache (#694)", () => {
    beforeEach(() => forgetLayouts());

    it("keys a graph by its shape: same notes and links, same key", () => {
        expect(layoutKey(chain(["a", "b", "c"]))).toBe(layoutKey(chain(["a", "b", "c"])));
        expect(layoutKey(chain(["a", "b", "c"]))).not.toBe(layoutKey(chain(["a", "b", "d"])));
    });

    it("gives back exactly what it was given, and a copy of it", () => {
        const scene = chain(["a", "b"]);
        const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
        rememberLayout("k", scene, positions);
        const back = recallLayout("k") as Float32Array;
        expect(Array.from(back)).toEqual([1, 2, 3, 4, 5, 6]);
        back[0] = 99;
        expect((recallLayout("k") as Float32Array)[0]).toBe(1);
    });

    it("keeps the last few, and lets the oldest go", () => {
        const scene = chain(["a"]);
        for (const key of ["k1", "k2", "k3", "k4", "k5"]) rememberLayout(key, scene, new Float32Array(3));
        expect(recallLayout("k1")).toBeNull();
        expect(recallLayout("k5")).not.toBeNull();
    });

    it("starts from scratch when nothing is known", () => {
        expect(warmStart(chain(["a", "b"]))).toMatchObject({ alpha: 1, known: 0 });
    });

    it("keeps a known note where it was, and starts a new one beside its neighbours", () => {
        const before = chain(["a", "b"]);
        rememberLayout("before", before, new Float32Array([100, 0, 0, 120, 0, 0]));
        const after = chain(["a", "b", "c"]);
        const start = warmStart(after);
        const at = (path: string) => after.index.get(path) as number;
        expect(start.known).toBe(2);
        expect(start.initial[at("a.md") * 3]).toBe(100);
        expect(start.initial[at("b.md") * 3]).toBe(120);
        // c links from b: it starts near b, not wherever the seed would have put it.
        expect(Math.abs(start.initial[at("c.md") * 3] - 120)).toBeLessThan(10);
        // Two thirds known: settle, do not start over.
        expect(start.alpha).toBeLessThan(1);
    });
});

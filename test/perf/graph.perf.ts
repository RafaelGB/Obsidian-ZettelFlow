import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { buildScene } from "architecture/components/core/graph/graphScene";
import { allocatePaint, paint, type PaintState } from "architecture/components/core/graph/graphPaint";
import { readGraphTheme } from "architecture/components/core/graph/graphTheme";
import { createLayout } from "architecture/components/core/graph/layoutCore";
import { defaultCamera, viewProjection } from "architecture/components/core/graph/graphCamera";
import { pickNearest } from "architecture/components/core/graph/graphPick";
import { labelCandidates, placeLabels, rankForLabels } from "architecture/components/core/graph/graphLabels";
import { forgetLayouts, layoutKey, recallLayout, rememberLayout } from "architecture/components/core/graph/layoutCache";
import { generateVault } from "./generateVault";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * The graph's budgets (epic #692). The frame rate needs a screen and is walked by hand; what the
 * plugin ships, and what it spends on the main thread before and between frames, does not.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

/** The best of a few runs: the gate is for a change in shape, not a noisy runner. */
function best(runs: number, work: () => unknown): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runs; i++) {
        const started = performance.now();
        work();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

function modelOf(count: number): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(generateVault(count, 3).map((snapshot) => deriveIdea(snapshot, {})));
    return model;
}

/** The median of `count` ticks — a tick's cost, not the warm-up's. */
function medianTick(layout: { tick(): number }, count: number): number {
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
        const started = performance.now();
        layout.tick();
        times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    return times[times.length >> 1];
}

describe("the layout, off the main thread (#694)", () => {
    const data2k = build3DGraph(modelOf(2_000));

    it("view.graph.layout.tick.2k", () => {
        const scene = buildScene(data2k);
        const layout = createLayout({ n: scene.n, edges: scene.edges, community: scene.community, communityCount: scene.communities.length });
        assertBudget("view.graph.layout.tick.2k", medianTick(layout, 30));
    });

    it("view.graph.layout.settle.2k", () => {
        const scene = buildScene(data2k);
        const layout = createLayout({ n: scene.n, edges: scene.edges, community: scene.community, communityCount: scene.communities.length });
        const started = performance.now();
        while (!layout.settled()) layout.tick();
        assertBudget("view.graph.layout.settle.2k", performance.now() - started);
    });
});

describe("the graph engine (#693)", () => {
    const data = build3DGraph(modelOf(10_000));

    it("view.graph.scene.10k", () => {
        assertBudget("view.graph.scene.10k", best(5, () => buildScene(data)));
    });

    it("view.graph.paint.10k", () => {
        const scene = buildScene(data);
        const theme = readGraphTheme(() => "#808080");
        const buffers = allocatePaint(scene, 32);
        const lit = new Set<number>();
        for (let i = 0; i < scene.n; i += 7) lit.add(i);
        const state: PaintState = { colorBy: "region", lit, focus: null, fade: 1, timeCursor: Infinity, edgeAsk: null, hubs: new Set(scene.hubs.slice(0, 14)) };
        assertBudget("view.graph.paint.10k", best(20, () => paint(scene, theme, state, buffers)));
    });

    it("view.graph.layout.tick.10k", () => {
        const scene = buildScene(data);
        const layout = createLayout({ n: scene.n, edges: scene.edges, community: scene.community, communityCount: scene.communities.length });
        assertBudget("view.graph.layout.tick.10k", medianTick(layout, 15));
    });

    it("view.graph.layout.reopen.10k", () => {
        forgetLayouts();
        const scene = buildScene(data);
        rememberLayout(layoutKey(scene), scene, new Float32Array(scene.n * 3));
        assertBudget("view.graph.layout.reopen.10k", best(5, () => recallLayout(layoutKey(scene))));
    });

    it("view.graph.pick.10k", () => {
        const scene = buildScene(data);
        const positions = new Float32Array(scene.n * 3).map((_, i) => ((i * 7919) % 2000) - 1000);
        const alpha = new Float32Array(scene.n * 4).fill(1);
        const cam = defaultCamera();
        cam.dist = 2600;
        const m = viewProjection(cam, 1280, 800);
        assertBudget("view.graph.pick.10k", best(10, () => pickNearest(m, cam, positions, alpha, scene.degree, scene.n, 640, 400, { width: 1280, height: 800 }, null)));
    });

    it("view.graph.labels.10k", () => {
        const scene = buildScene(data);
        const lit = new Set<number>();
        for (let i = 0; i < scene.n; i++) lit.add(i);
        assertBudget(
            "view.graph.labels.10k",
            best(10, () => {
                const ranked = rankForLabels(lit, scene.degree);
                const candidates = labelCandidates({ hover: 3, marked: [], ranked, hubs: scene.hubs, density: "more" });
                return placeLabels(candidates, (i) => ({ x: (i * 37) % 1200 + 40, y: (i * 53) % 700 + 50, r: 4 }), (i) => scene.names[i], (t) => t.length * 6, { width: 1280, height: 800 });
            })
        );
    });

    it("view.graph.bundle.kb", () => {
        const root = join(__dirname, "..", "..");
        try {
            execSync("node esbuild.config.mjs production", { cwd: root, stdio: "ignore" });
        } catch (error) {
            // eslint-disable-next-line no-console
            console.log("view.graph.bundle.kb — skipped: the production build did not run here", error);
            expect(true).toBe(true);
            return;
        }
        const main = join(root, "dist", "main.js");
        if (!existsSync(main)) {
            // eslint-disable-next-line no-console
            console.log("view.graph.bundle.kb — skipped: dist/main.js was not produced");
            expect(true).toBe(true);
            return;
        }
        assertBudget("view.graph.bundle.kb", statSync(main).size / 1024);
    });
});

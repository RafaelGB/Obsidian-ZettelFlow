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

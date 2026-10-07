import { describe, it } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { drawGlimpse, glimpseOf, type GlimpseContext } from "architecture/components/core/home/glimpse";
import { generateVault } from "./generateVault";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * Home's budgets (epic #701). The glimpse runs a frame loop on the front door, so the frame is
 * gated: whatever the vault's size, one frame stays well inside a 60 fps budget.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

function best(runs: number, work: () => unknown): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runs; i++) {
        const started = performance.now();
        work();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

/** A canvas that does the arithmetic a real one is handed and draws nothing. */
function nullContext(): GlimpseContext {
    return {
        globalCompositeOperation: "",
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        clearRect: () => undefined,
        beginPath: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        stroke: () => undefined,
        createRadialGradient: () => ({ addColorStop: () => undefined }),
    };
}

describe("the vault glimpse (#705)", () => {
    const model = new KnowledgeModel();
    model.build(generateVault(10_000, 5).map((snapshot) => deriveIdea(snapshot, {})));
    const glimpse = glimpseOf(build3DGraph(model), Date.now());

    it("view.home.glimpse.frame.10k", () => {
        const ctx = nullContext();
        const colours = { dark: true, slot: () => [0.4, 0.5, 0.9, 1] as [number, number, number, number] };
        let t = 0;
        assertBudget("view.home.glimpse.frame.10k", best(20, () => drawGlimpse(ctx, glimpse, colours, 260, 150, (t += 0.016))));
    });
});

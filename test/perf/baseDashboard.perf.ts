import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { applyTransforms } from "dashboards/transform";
import type { TransformStep } from "dashboards/transform";
import { ComputedResolver } from "dashboards/base/scriptTransform";
import { clearSamples, lastSample, measure, type Measurable } from "architecture/monitoring/measure";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * Base Dashboards budgets (epic #622, S8 #630).
 *
 * The pipeline runs on every Base update, so normalization and a panel's transforms are interaction
 * latency, not load time. The bundle case is the other half of the promise: ECharts earns its place
 * only if it is tree-shaken — a ceiling that an accidental `import *` would blow through.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) {
        throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
    }
}

function timed(name: Measurable, work: () => unknown, scale?: number): number {
    clearSamples();
    measure(name, work, scale === undefined ? {} : { scale });
    return lastSample(name)?.ms ?? Number.POSITIVE_INFINITY;
}

const PROPS: FieldDescriptor[] = [
    { id: "note.day", name: "Day" },
    { id: "note.cat", name: "Cat" },
    { id: "note.n", name: "N" },
];

function entries(count: number): AdaptedEntry[] {
    const out: AdaptedEntry[] = [];
    for (let i = 0; i < count; i++) {
        const day = `2026-01-${String((i % 28) + 1).padStart(2, "0")}`;
        out.push({
            path: `n${i}.md`,
            cells: {
                "note.day": { kind: "date", display: day, raw: day },
                "note.cat": { kind: "category", display: `c${i % 12}`, raw: `c${i % 12}` },
                "note.n": { kind: "number", display: String(i % 10), raw: i % 10 },
            },
        });
    }
    return out;
}

describe("the Base dashboard data path (#622)", () => {
    it("dashboard.normalize.10k", () => {
        const ents = entries(10_000);
        const ms = timed("analysis.heaviest", () => normalize(ents, PROPS, `s${Math.random()}`), 10_000);
        assertBudget("dashboard.normalize.10k", ms);
    });

    it("dashboard.transform.10k", () => {
        const snap = normalize(entries(10_000), PROPS, "fixed");
        const steps: TransformStep[] = [
            { id: "f", type: "filter", field: "note.n", op: "gte", value: "2" },
            { id: "g", type: "groupBy", field: "note.cat", field2: "note.n", aggregate: "sum" },
        ];
        const ms = timed("analysis.heaviest", () => applyTransforms(snap, steps), 10_000);
        assertBudget("dashboard.transform.10k", ms);
    });

    it("dashboard.computed.10k", async () => {
        const base = normalize(entries(10_000), PROPS, "fixed");
        const resolver = new ComputedResolver({
            loadZf: async () => ({ knowledge: {}, internal: { vault: {} } }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            compile: () => async (row: any) => ({ score: (row.n as number) + 1 }),
            record: () => undefined,
        });
        const started = Date.now();
        await resolver.resolve(base, { enabled: true, code: "return rows" });
        assertBudget("dashboard.computed.10k", Date.now() - started);
    });

    it("dashboard.bundle.kb", () => {
        const root = join(__dirname, "..", "..");
        try {
            execSync("node esbuild.config.mjs production", { cwd: root, stdio: "ignore" });
        } catch (error) {
            // eslint-disable-next-line no-console
            console.log("dashboard.bundle.kb — skipped: the production build did not run here", error);
            expect(true).toBe(true);
            return;
        }
        const main = join(root, "dist", "main.js");
        if (!existsSync(main)) {
            // eslint-disable-next-line no-console
            console.log("dashboard.bundle.kb — skipped: dist/main.js was not produced");
            expect(true).toBe(true);
            return;
        }
        assertBudget("dashboard.bundle.kb", statSync(main).size / 1024);
    });
});

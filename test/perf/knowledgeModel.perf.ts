import { describe, it, expect, beforeAll } from "@jest/globals";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { parseInlineFields } from "architecture/knowledge/parse/inlineFields";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";
import { computeKnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { deriveFacets } from "architecture/knowledge/query/facets";
import { movesFor, MOVE_CEILING, type Move } from "application/thinking/move";
import { clearSamples, lastSample, measure, type Measurable } from "architecture/monitoring/measure";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";
import { generateBody, generateVault } from "./generateVault";
import { newThought, type Thought } from "application/thinking/thought";
import { filterThreads, threadThoughts } from "application/thinking/thread";

/**
 * The budget suite (#457, epic #452).
 *
 * Not part of `npm test`: it builds vaults of fifty thousand notes, which would make the loop a
 * developer runs on every save slow enough to start skipping. It is `npm run test:perf`, its own
 * CI step, and it **fails the build** when a budget is exceeded — saying by how much, and why that
 * budget exists.
 *
 * Everything is timed through the same `measure` the app uses, so the numbers CI asserts and the
 * numbers shown in Health (#462) come out of one instrument.
 */

/** Assert a measured value against its budget, printing the comparison either way. */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) {
        throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
    }
}

/** Time one thing through the shared instrument and hand back the milliseconds. */
function timed(name: Measurable, work: () => unknown, scale?: number): number {
    clearSamples();
    measure(name, work, scale === undefined ? {} : { scale });
    return lastSample(name)?.ms ?? Number.POSITIVE_INFINITY;
}

function modelOf(count: number, seed = 1): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(generateVault(count, seed).map((snapshot) => deriveIdea(snapshot, {})));
    return model;
}

describe("building the index", () => {
    it.each([
        ["index.build.1k" as const, 1_000],
        ["index.build.10k" as const, 10_000],
        ["index.build.50k" as const, 50_000],
    ])("%s", (key, count) => {
        const vault = generateVault(count);
        const ms = timed(
            "index.build",
            () => {
                const model = new KnowledgeModel();
                model.build(vault.map((snapshot) => deriveIdea(snapshot, {})));
                return model;
            },
            count
        );
        assertBudget(key, ms);
    });
});

describe("deriving one note", () => {
    it("derive.one", () => {
        const vault = generateVault(2_000);
        // One derive is too fast to time honestly. A thousand of them, averaged, is the number
        // that actually multiplies out across a session of vault events.
        const ms = timed(
            "derive.one",
            () => {
                for (let index = 0; index < 1_000; index++) deriveIdea(vault[index], {});
            },
            1_000
        );
        assertBudget("derive.one", ms / 1_000);
    });
});

describe("the enrichment pass", () => {
    it("enrich.parse.50k", () => {
        const bodies = generateVault(50_000).map(generateBody);
        const ms = timed(
            "enrich.full",
            () => {
                for (const body of bodies) parseInlineFields(body);
            },
            bodies.length
        );
        // Parsing only. The fifty thousand `cachedRead` calls around it are the expensive half,
        // and no harness without a vault can measure them — #462 reports them from the app.
        assertBudget("enrich.parse.50k", ms);
    });
});

describe("the projections the surfaces run", () => {
    let model: KnowledgeModel;
    beforeAll(() => {
        model = modelOf(10_000);
    });

    it("analysis.map.10k", () => {
        assertBudget("analysis.map.10k", timed("analysis.heaviest", () => buildKnowledgeMap(model), 10_000));
    });

    it("analysis.debt.10k", () => {
        assertBudget("analysis.debt.10k", timed("analysis.heaviest", () => computeKnowledgeDebt(model), 10_000));
    });

    it("analysis.discovery.10k", () => {
        assertBudget("analysis.discovery.10k", timed("analysis.heaviest", () => findDiscoveries(model), 10_000));
    });

    it("memoised: a second render of an unchanged model costs nothing (#458)", () => {
        const fresh = modelOf(10_000, 3);
        const first = timed("analysis.heaviest", () => findDiscoveries(fresh), 10_000);
        const second = timed("analysis.heaviest", () => findDiscoveries(fresh), 10_000);
        // eslint-disable-next-line no-console
        console.log(`memo — discovery first render ${first.toFixed(1)} ms, second ${second.toFixed(3)} ms`);
        expect(second).toBeLessThan(first / 100);
    });

    it("analysis.discovery.scaling", () => {
        // The shape, not the number. Pairwise work that slipped to quadratic would still pass the
        // 10k ceiling and be unusable at 50k, so what is asserted is how the cost grows when the
        // vault doubles.
        const at10k = timed("analysis.heaviest", () => findDiscoveries(modelOf(10_000)), 10_000);
        const at20k = timed("analysis.heaviest", () => findDiscoveries(modelOf(20_000)), 20_000);
        assertBudget("analysis.discovery.scaling", at20k / Math.max(at10k, 1));
    });
});

describe("what the model costs to hold", () => {
    it("model.memory.50k", () => {
        if (typeof global.gc !== "function") {
            // Without `--expose-gc` the reading is dominated by uncollected garbage. Say so and
            // move on, rather than assert a number that means nothing.
            // eslint-disable-next-line no-console
            console.log("model.memory.50k — skipped: needs --expose-gc for a meaningful reading");
            expect(true).toBe(true);
            return;
        }
        global.gc();
        const before = process.memoryUsage().heapUsed;
        const model = modelOf(50_000);
        global.gc();
        const after = process.memoryUsage().heapUsed;
        // Keep the model reachable across the reading, or it is an empty heap being measured.
        expect(model.revision()).toBeGreaterThan(0);
        assertBudget("model.memory.50k", (after - before) / (1024 * 1024));
    });
});

describe("a lab that has grown", () => {
    it("lab.thread.500", () => {
        // Threads of five, which is what a lab actually looks like after a few weeks.
        const thoughts: Thought[] = [];
        for (let root = 0; root < 100; root++) {
            const id = `r${root}`;
            thoughts.push(newThought({ text: `a thought about topic ${root % 17}`, id, at: root * 1000 }));
            for (let answer = 0; answer < 4; answer++) {
                thoughts.push(
                    newThought({
                        text: `an answer ${answer} concerning topic ${root % 17}`,
                        id: `${id}-${answer}`,
                        at: root * 1000 + answer + 1,
                        respondsTo: { to: id, as: answer % 2 === 0 ? "fork" : "challenge" },
                    })
                );
            }
        }
        const ms = timed(
            "canvas.scan",
            () => {
                for (let round = 0; round < 20; round++) {
                    filterThreads(threadThoughts(thoughts), `topic ${round % 17}`);
                }
            },
            thoughts.length
        );
        // Per keystroke, which is what the number has to mean for it to be honest.
        assertBudget("lab.thread.500", ms / 20);
    });
});

describe("what Explore offers you (#482)", () => {
    it("facets.50k", () => {
        // Facets are re-derived after **every** click, against the selection you just made, so
        // this number is interaction latency. The whole-vault case is the worst one: the selection
        // is every note, and the incoming-relation walk covers every edge in the graph.
        const model = modelOf(50_000);
        const selection = model.all();
        const ms = timed("analysis.heaviest", () => deriveFacets(model, selection), selection.length);
        assertBudget("facets.50k", ms);
    });
});

describe("the move record (#491)", () => {
    it("moves.read", () => {
        // A full log, spread over 200 subjects, which is what a year of thinking looks like.
        const moves: Move[] = Array.from({ length: MOVE_CEILING }, (_, n) => ({
            id: `m${n}`,
            at: n,
            primitive: "perturb" as const,
            verb: "challenge",
            subject: `note-${n % 200}.md`,
        }));
        const ms = timed(
            "analysis.heaviest",
            () => {
                for (let round = 0; round < 50; round++) movesFor(`note-${round % 200}.md`, moves);
            },
            moves.length
        );
        // Per render, which is what the number has to mean for it to be honest.
        assertBudget("moves.read", ms / 50);
    });
});

import { describe, it, expect, beforeAll } from "@jest/globals";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { parseInlineFields } from "architecture/knowledge/parse/inlineFields";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";
import { communitiesOf } from "architecture/knowledge/map/communities";
import { gapSeams } from "architecture/knowledge/map/gapSeams";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { computeKnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { findDiscoveries, gapTally, topGaps } from "architecture/knowledge/discovery/discoveries";
import { deriveFacets } from "architecture/knowledge/query/facets";
import { movesFor, MOVE_CEILING, type Move } from "application/thinking/move";
import { clearSamples, lastSample, measure, type Measurable } from "architecture/monitoring/measure";
import { clearMemo } from "architecture/knowledge/model/memo";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";
import { generateBody, generateVault } from "./generateVault";
import { dueClaims } from "architecture/knowledge/review/dueClaims";
import { drawCollision } from "architecture/knowledge/map/drawCollision";
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

    it("analysis.communities.10k", () => {
        assertBudget("analysis.communities.10k", timed("analysis.heaviest", () => communitiesOf(model), 10_000));
    });

    it("analysis.debt.10k", () => {
        assertBudget("analysis.debt.10k", timed("analysis.heaviest", () => computeKnowledgeDebt(model), 10_000));
    });

    it("view.graph3d.build.10k", () => {
        // What the plugin spends before WebGL sees anything (#539). The other half of that
        // question -- what the scene then does per frame -- needs a screen, and is recorded as
        // unmeasured rather than guessed at.
        assertBudget("view.graph3d.build.10k", timed("analysis.heaviest", () => build3DGraph(model), 10_000));
    });

    it("analysis.gaps.seams.10k", () => {
        // Its own model, and its two dependencies warmed first: what is timed is the aggregation,
        // not the tally underneath it (which `analysis.gaps.tally.10k` already measures).
        const fresh = modelOf(10_000, 11);
        gapTally(fresh);
        communitiesOf(fresh);
        const ms = timed("analysis.heaviest", () => gapSeams(fresh), 10_000);
        // Release the tally before the next case measures anything. It is 56 MB per model revision
        // (`memo.gaps.10k`), and three of these left standing read as a 40 % regression in whatever
        // was declared next -- which is how this suite first reported 1,208 ms here for a 538 ms
        // projection.
        clearMemo(fresh);
        global.gc?.();
        assertBudget("analysis.gaps.seams.10k", ms);

        // The invariant AC-4 asserts at two thousand notes in `npm test`, here at the full ten.
        const communities = communitiesOf(fresh);
        const communityOf = new Map<string, number>();
        communities.forEach((community, index) => {
            for (const path of [community.hub, ...community.members]) communityOf.set(path, index);
        });
        let violations = 0;
        for (const gap of gapTally(fresh).candidates()) {
            const from = communityOf.get(gap.a);
            const to = communityOf.get(gap.b);
            if (from === undefined || to === undefined || communities[from].region !== communities[to].region) {
                violations++;
            }
        }
        expect(violations).toBe(0);
    });

    it("analysis.gaps.tally.10k", () => {
        // A model of its own, never the suite's shared one: `gapTally` is memoised on the model
        // instance, so priming that model here would turn `analysis.discovery.10k` below into a
        // memo hit -- it would read near zero and the one budget guarding the cost of this pass
        // would silently stop guarding anything.
        //
        // Built *outside* the timed closure. Inside it, the reading also covered generateVault, ten
        // thousand deriveIdea calls and the index build, which is how the first recorded number came
        // out larger than the `analysis.discovery.10k` it is a part of.
        const fresh = modelOf(10_000, 7);
        const ms = timed("analysis.heaviest", () => gapTally(fresh), 10_000);
        clearMemo(fresh); // 56 MB, and the next case has to start on a clean heap
        global.gc?.();
        assertBudget("analysis.gaps.tally.10k", ms);
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

/**
 * What the **shared pass** costs (#530, epic #529).
 *
 * Its own block, and after the projections, for a measurement reason rather than a tidiness one:
 * these two cases hold a ten-thousand-note model plus a 1.26-million-element array, and while they
 * sat among the projection cases the garbage they left read as a **40 % regression** in every case
 * declared after them -- `analysis.discovery.10k` measured 1,616 ms where it measures 953 ms with a
 * clean heap. Each case drops its model, clears the memo it filled and collects, so whatever runs
 * next starts level.
 */
describe("what the shared gap pass costs", () => {
    it("analysis.gaps.top.all.10k", () => {
        // The pathological limit, which a script can ask for: `zf.knowledge.discoveries({ limit:
        // 1000000 })`. Bounded selection is O(pairs) plus O(limit) per accepted insert, so past
        // SELECTION_MAX it collects and sorts instead -- without that, this read 18.6 s at three
        // thousand notes and minutes here.
        const fresh = modelOf(10_000, 17);
        gapTally(fresh);
        const ms = timed("analysis.heaviest", () => topGaps(fresh, Number.MAX_SAFE_INTEGER), 10_000);
        clearMemo(fresh);
        global.gc?.();
        assertBudget("analysis.gaps.top.all.10k", ms);
    });

    it("memo.gaps.10k", () => {
        if (typeof global.gc !== "function") {
            // eslint-disable-next-line no-console
            console.log("memo.gaps.10k — skipped: needs --expose-gc for a meaningful reading");
            expect(true).toBe(true);
            return;
        }
        // What the shared pass *retains*, which is the cost of sharing it (the #537 review). Before
        // the tally was packed into numeric keys it was 200 MB for 1.26 million pairs. The model is
        // outside the reading: it is built first, and only the projection happens between the marks.
        const fresh = modelOf(10_000, 13);
        global.gc();
        const before = process.memoryUsage().heapUsed;
        const tally = gapTally(fresh);
        global.gc();
        const after = process.memoryUsage().heapUsed;
        // eslint-disable-next-line no-console
        console.log(`memo.gaps.10k — ${tally.size} gaps retained`);
        expect(tally.size).toBeGreaterThan(0); // keep it reachable, or an empty heap is measured
        const mb = (after - before) / (1024 * 1024);
        clearMemo(fresh);
        global.gc();
        assertBudget("memo.gaps.10k", mb);
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

describe("what comes back (#563)", () => {
    it("analysis.dueclaims.10k", () => {
        // Every tenth note says something, which is a generous reading of a real vault: the
        // reference vault had **zero** claims the day this shipped. The selection walks the whole
        // model regardless, so the shape of the work does not depend on how many bear claims.
        const model = modelOf(10_000);
        let index = 0;
        for (const idea of model.all()) {
            if (index++ % 10 === 0) idea.claims = [{ text: `claim ${index}`, sources: [] }];
        }
        const now = Date.now();
        const ms = timed("analysis.heaviest", () => dueClaims({ model, intervalDays: 90, now }), 10_000);
        assertBudget("analysis.dueclaims.10k", ms);
    });
});

describe("two things nowhere near each other (#566)", () => {
    it("analysis.collision.draw.10k", () => {
        const model = modelOf(10_000);
        // The partition is a function of the model and memoised like the projections it reads, so
        // the honest number is the **warm** one: what one draw costs while the panel is open. The
        // cold pass is `buildKnowledgeMap` + `communitiesOf`, both already budgeted above.
        drawCollision(model, { seed: 0, distance: "very-far" });
        const ms = timed(
            "analysis.heaviest",
            () => {
                for (let seed = 1; seed <= 100; seed++) drawCollision(model, { seed, distance: "very-far" });
            },
            10_000
        );
        // Per draw, which is what the number has to mean for it to be honest.
        assertBudget("analysis.collision.draw.10k", ms / 100);
    });
});

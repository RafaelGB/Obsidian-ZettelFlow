/**
 * The budgets (#457, epic #452).
 *
 * One file, so everything ZettelFlow promises about its own speed reads in one screen, and so
 * changing a promise is a visible diff rather than a number moved inside a test.
 *
 * Each budget is a **ceiling with a reason**, never a record of the fastest run anyone has seen.
 * A budget sitting on the current measurement turns every noisy runner red and teaches the team
 * to ignore the gate; a budget with no headroom is a wish. These sit ~3–5× above the measurement,
 * because the gate exists to catch a change in **shape** — an accidental O(n²), a cache that
 * stopped caching — not a three-percent drift.
 *
 * ## What these do not measure, and why it matters
 *
 * Everything here is the **pure model layer**: snapshots in, ideas and projections out. That is
 * deliberate (it runs with no Obsidian, no DOM, no files) and it is also a real limit: the cost of
 * `getMarkdownFiles`, the metadata cache, and the fifty thousand `cachedRead` calls the enrichment
 * pass makes is **not** in any number below. `enrich.parse` times the parsing, not the reading —
 * and the reading is the part that hurts. #462 shows the real, in-app timings for that.
 */

export interface Budget {
    /** What is being timed. */
    name: string;
    /** The ceiling: milliseconds, megabytes for `memory`, or a ratio for a scaling budget. */
    limit: number;
    /** Why that number, in one line. Every budget must be able to answer this. */
    because: string;
    /** What it was measured at, on the reference machine. */
    measured: string;
}

/**
 * Baseline measured 2026-09-18, Node 22, `--runInBand`, `--expose-gc`, on the reference laptop.
 * The numbers were a surprise and are recorded here rather than smoothed over: **the model layer
 * is fast**. Fifty thousand notes derive and index in about a tenth of a second. What is slow is
 * one projection — discovery — and it is recomputed on every render, which is what #458 fixes.
 *
 * Re-measured 2026-09-22 for #530: that projection built a 1.26-million-element array out of its
 * tally and sorted the whole thing to return three rows. It is now a shared tally plus a **bounded
 * selection**, and the honest measurement of that is an A/B in one process on one warm tally, at
 * 10,000 notes and 1.24 million gaps:
 *
 * | the part that changed | measured |
 * |---|---|
 * | collect + full sort + slice (what it was) | 1,393 ms · 1,437 ms |
 * | bounded selection (what it is) | 553 ms · 434 ms |
 *
 * About **three times faster** on the step that changed, over a shared tally of ~960 ms that both
 * paths pay once.
 *
 * **Do not compare the numbers below across days or machines.** Measured on this machine, the same
 * code in a full suite run varies by ~40 % — `analysis.discovery.10k` read 953 ms and 1,573 ms on
 * consecutive runs of identical code, and a case that leaves a 56 MB memo entry standing inflates
 * every case declared after it. The values recorded here are from one full `--runInBand
 * --expose-gc` run; the ceilings sit far enough above them to survive that spread, which is what a
 * budget is for. An A/B in one process is the only way to compare two implementations here.
 */
export const BUDGETS = {
    "index.build.1k": {
        name: "build the index from 1,000 notes",
        limit: 30,
        measured: "2.8 ms",
        because: "the size most vaults start at; anything visible here would be a real defect",
    },
    "index.build.10k": {
        name: "build the index from 10,000 notes",
        limit: 150,
        measured: "21.8 ms",
        because: "a serious vault, and still an order of magnitude inside a frame budget",
    },
    "index.build.50k": {
        name: "build the index from 50,000 notes",
        limit: 600,
        measured: "103.4 ms",
        because:
            "the target this epic designs for — cheap enough that deriving on load is not the cold-start problem it was assumed to be",
    },
    "derive.one": {
        name: "derive one note into an idea",
        limit: 0.05,
        measured: "0.003 ms (average of 1,000)",
        because: "runs on every vault event, so it multiplies by everything the user does",
    },
    "enrich.parse.50k": {
        name: "parse inline fields across 50,000 note bodies",
        limit: 250,
        measured: "37.8 ms",
        because:
            "the parsing half of the enrichment pass; the reading half is I/O and is not measured here (#459)",
    },
    "analysis.map.10k": {
        name: "build the knowledge map over 10,000 notes",
        limit: 120,
        measured: "13.9 ms",
        because: "recomputed on every surface render today, which is what #458 changes",
    },
    "analysis.communities.10k": {
        name: "find the Louvain communities inside every region over 10,000 notes",
        limit: 400,
        measured: "157.3 ms",
        because:
            "the finest partition the graph lens draws (#522); it runs per region on every model revision, and #452 exists because reasoning about cost was wrong twice",
    },
    "analysis.debt.10k": {
        name: "compute knowledge debt over 10,000 notes",
        limit: 60,
        measured: "5.1 ms",
        because: "the Health surface's main projection",
    },
    "analysis.gaps.top.all.10k": {
        name: "ask for every gap at once over 10,000 notes",
        limit: 5_000,
        measured: "1,685 ms",
        because:
            "a limit past the end of the tally is reachable from zf.knowledge.discoveries, and bounded selection turns quadratic there -- 18.6 s at three thousand notes before SELECTION_MAX existed; this is the budget that keeps the fallback honest",
    },
    "memo.gaps.10k": {
        name: "megabytes the shared gap tally retains at 10,000 notes",
        limit: 80,
        measured: "55.9 MB",
        because:
            "the tally is held for as long as the model revision stands, so it is the one thing in this epic that costs memory rather than time; as objects under string keys the same 1.26 million pairs measured 200 MB, and MEMO_MAX_ENTRIES is not a memory ceiling if one entry can be that big",
    },
    "view.graph3d.build.10k": {
        name: "build the 3D graph's data for 10,000 notes",
        limit: 400,
        measured: "70.4 ms",
        because:
            "the half of the 3D graph a headless runner can see (#539). The view has a documented 600-node cap that nothing ever called, and the question -- apply it or delete it -- needed evidence. This is the evidence that exists without a screen: what the *plugin* spends turning a model into nodes and links before WebGL is handed anything. Frames per second is the other half, and no Node process can measure it. Two runs measured 70.4 ms and 27.2 ms; the **slower** is recorded here, because a ceiling should clear the worst seen and because one number from one run is how the last speed claim in this repo went wrong",
    },
    "analysis.gaps.seams.10k": {
        name: "aggregate every gap into seams over 10,000 notes",
        limit: 4_000,
        measured: "1,341 ms",
        because:
            "one pass over a tally of 1.26 million pairs plus one over the ideas for the link counts (#531); the premise of the epic is that counting is cheap where sorting was not, and this is where that premise is checked",
    },
    "analysis.gaps.tally.10k": {
        name: "tally every gap over 10,000 notes",
        limit: 5_000,
        measured: "1,310 ms",
        because:
            "the shared candidate pass every gap reader in epic #529 stands on (#530); it is the same walk `analysis.discovery.10k` used to do for itself, so the two move together and neither may drift",
    },
    "analysis.discovery.10k": {
        name: "find discoveries over 10,000 notes",
        limit: 5_000,
        measured: "1,573 ms",
        because:
            "a hundred times every other projection and re-run on every render — the single most expensive thing ZettelFlow computes",
    },
    "moves.read": {
        name: "read one subject's moves from a log at its ceiling",
        limit: 2,
        measured: "0.016 ms",
        because:
            "the timeline reads this on every render, so it is interaction latency; the log is bounded at 2,000 entries, which is the worst case by construction",
    },
    "facets.50k": {
        name: "derive the Explore facets over 50,000 notes",
        limit: 600,
        measured: "190 ms",
        because:
            "the facets are re-derived after every click, so this is interaction latency rather than load time; the number recorded is the busy-machine run (an idle one is 69 ms), because a ceiling set from the flattering measurement is a gate that goes red on a noisy runner",
    },
    "analysis.discovery.scaling": {
        name: "how discovery grows when the vault doubles (20k ÷ 10k)",
        limit: 3.5,
        measured: "2.24×",
        because:
            "the shape matters more than the number: pairwise work that slips to quadratic would pass an absolute ceiling at 10k and be unusable at 50k",
    },
    "lab.thread.500": {
        name: "thread and filter a lab of 500 thoughts",
        limit: 8,
        measured: "0.65 ms per keystroke",
        because:
            "the cost of the Lab succeeding: filtering has to feel like typing, not like searching",
    },
    "model.memory.50k": {
        name: "heap retained by the model for 50,000 notes, in MB",
        limit: 150,
        measured: "44.9 MB",
        because: "decides whether a 50k vault is usable at all, not merely slow to load",
    },
} satisfies Record<string, Budget>;

export type BudgetKey = keyof typeof BUDGETS;

/** What a budget check reports — including, when it fails, by how much. */
export interface BudgetResult {
    key: BudgetKey;
    measured: number;
    limit: number;
    within: boolean;
    /** How far over, as a multiple of the limit. `1.0` is exactly on it. */
    ratio: number;
}

export function checkBudget(key: BudgetKey, measured: number): BudgetResult {
    const { limit } = BUDGETS[key];
    return { key, measured, limit, within: measured <= limit, ratio: measured / limit };
}

/** The line a budget prints. Saying *by how much* is the whole value of the gate. */
export function describeBudget(result: BudgetResult): string {
    const budget = BUDGETS[result.key];
    const verdict = result.within
        ? "within"
        : `OVER by ${(result.ratio * 100 - 100).toFixed(0)}%`;
    return `${result.key} — ${budget.name}: ${result.measured.toFixed(3)} / ${result.limit} (${verdict})`;
}

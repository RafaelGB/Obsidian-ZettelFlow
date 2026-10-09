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
    "index.build.10k.scoped": {
        name: "build the index from 10,000 notes, through two folder, two tag and one property rule",
        limit: 150,
        measured: "26 ms",
        because:
            "AC-11 of #713: the scope rules may never push a build past the ceiling an unscoped build has, so they share it",
    },
    "scope.evaluate.50k": {
        name: "compile the scope rules and decide 50,000 notes",
        limit: 300,
        measured: "126 ms",
        because:
            "the rules run on every index build; set lookups keep it linear, and this catches a per-note recompile or a quadratic nested-tag walk (#713). Measured on the CI runner; a desktop does it in 67 ms",
    },
    "scope.census.50k": {
        name: "count what every rule leaves out, group the left-out notes and gather the vocabulary, over 50,000 notes",
        limit: 900,
        measured: "364 ms",
        because:
            "one settings-card render pays this; under a second on the CI runner, at fifty thousand notes, keeps the pane responsive (#713). A desktop does it in 220 ms",
    },
    "scope.draft.50k": {
        name: "preview one draft rule over 50,000 notes",
        limit: 150,
        measured: "49 ms",
        because: "it runs as you pick a value, so it has to fit within a few frames (#713). Measured on the CI runner; a desktop does it in 22 ms",
    },
    "index.build.50k": {
        name: "build the index from 50,000 notes",
        limit: 600,
        measured: "103.4 ms",
        because:
            "the target this epic designs for — cheap enough that deriving on load is not the cold-start problem it was assumed to be",
    },
    "analysis.collision.draw.10k": {
        name: "draw one collision over 10,000 notes",
        limit: 1,
        measured: "0.008 ms (average of 100, warm)",
        because:
            "a dice roll runs while you are looking at the panel; the whole design is that it costs two index lookups rather than the 48.7 M pairs it chooses from",
    },
    "analysis.dueclaims.10k": {
        name: "choose the one claim to offer back, over 10,000 notes",
        limit: 12,
        measured: "2.1 ms",
        because:
            "it runs where Home already computes its recommendations, and on the event engine's debounced pass — a return that costs a visible pause is a return nobody keeps on",
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
    "analysis.tend.10k": {
        name: "derive Tend's list over 10,000 notes",
        limit: 100,
        measured: "12.7 ms",
        because:
            "Health's first mode (#644): the next moves of every note plus the debt categories it composes, re-read on every model revision while Tend is open",
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
    "analysis.neighbourhood.hub": {
        name: "a hub's neighbourhood and its layout (80 links), 1,000 renders, in a 10,000-note vault",
        limit: 600,
        measured: "186 ms",
        because:
            "This note draws it on every note switch; it must cost what the note's links cost, never what the vault costs",
    },
    "analysis.neighbourhood.scaling": {
        name: "how a hub's neighbourhood grows when the vault around it doubles (20k ÷ 10k)",
        limit: 1.5,
        measured: "1.01×",
        because:
            "the projection reads only the note's own links; a ratio near 1 is that promise, and a vault walk would double it",
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
    "dashboard.normalize.10k": {
        name: "normalize a 10,000-row Base result into the DataStore",
        limit: 250,
        measured: "4.2 ms",
        because:
            "runs on every Base update (onDataUpdated); a visible pause here would be felt on every filter change (#622, S8)",
    },
    "dashboard.transform.10k": {
        name: "run a filter → group → aggregate pipeline over 10,000 rows",
        limit: 250,
        measured: "5.9 ms",
        because:
            "a panel re-runs its pipeline on every data update, so this is interaction latency, not load time (#622, S8)",
    },
    "dashboard.bundle.kb": {
        name: "the built plugin bundle (main.js) in KB, ECharts included",
        limit: 5_000,
        measured: "3,589 KB",
        because:
            "ECharts is imported tree-shaken on purpose; this ceiling catches an accidental `import * as echarts` or a chart that drags the whole library in (#622, S8)",
    },
    "dashboard.computed.10k": {
        name: "resolve a cheap computed field over 10,000 rows",
        limit: 250,
        measured: "14 ms",
        because:
            "a computed field re-resolves off the render path on each data update; a cheap one must add negligible overhead vs the un-enriched normalize (#632, against the #452 ~103 ms 50k-derive baseline)",
    },
    "dashboard.tasks.read.300": {
        name: "read the tasks of a 300-note Base twice (1 ms of disk per note), as two updates do",
        limit: 500,
        measured: "244 ms",
        because:
            "a Base updates whenever one of its notes does, and the Tasks panel read every note again, one after another: 7,204 ms here before, 244 ms now (on Windows, whose timers round the simulated 1 ms up to ~12) — notes are read side by side and an unchanged note is never read twice",
    },
    "dashboard.tasks.1k": {
        name: "parse and shape 5,000 tasks across 1,000 notes for a Tasks panel",
        limit: 250,
        measured: "6.2 ms",
        because:
            "a Tasks panel redraws on every data update and on every edit to one of its notes; parsing the lines and grouping them must stay well under a frame budget's worth of work (#635)",
    },
    "reader.search.1k": {
        name: "search a 1,000-chapter book (5 MB of prose) for a common word",
        limit: 400,
        measured: "118 ms (two searches, desktop)",
        because:
            "Ctrl/Cmd+F in the Reader searches the whole book on each pause in typing (#719); a long book must answer while you are still looking at the bar",
    },
    "reader.pdf.window.600": {
        name: "scroll a 600-page paper in Page view top to bottom (2,000 steps): the pages to draw and the page most on screen",
        limit: 30,
        measured: "7.6 ms",
        because:
            "it runs on every scroll frame of a paper in Page view (#767 FR-14); each step must cost a sliver of a frame, and the test also holds the pages drawn at seven or fewer, so a 600-page PDF never holds more than seven pictures",
    },
    "library.pdf.crop.frames": {
        name: "find a paper's two crop frames: 24 sampled dense pages (1,000 runs and 2,000 operators each) measured and joined",
        // ~4.5x the first measurement. Bound Math at module scope: a global looked up per call made it 150 ms here.
        limit: 25,
        measured: "5.5 ms",
        because:
            "it runs on the main thread between turning Crop margins on and the camera move (#769 FR-10); it must stay well under the move's own 400 ms (pdf.js parses the pages on its worker, outside this)",
    },
    "library.epub.fxl.window.300": {
        name: "turn a 300-page fixed-layout comic end to end in Spread: pair its pages, lay out each view, keep what the run keeps",
        // ~4.5x the first measurement (a millisecond is noise on a busy runner); the held count is asserted beside it.
        limit: 5,
        measured: "1.1 ms",
        because:
            "a comic is turned page after page; the pairing and the layout run on every turn, and the pages held must stay at six however long the book is (#771 FR-9, a 300-page comic on an iPad)",
    },
    "library.epub.fxl.css.200kb": {
        name: "clean a designed page's 200 KB stylesheet: its fonts renamed, its pictures made placeholders, every function checked",
        // ~3x the first measurement.
        limit: 50,
        measured: "15.3 ms",
        because:
            "it runs before a designed page can be drawn, between the turn and the page; a heavy comic's sheet must clean well inside the 120 ms the page takes to fade in (#771 FR-15)",
    },
    "library.shelf.500": {
        name: "build, order and search the Library shelf of 500 sources and 30 saved paths",
        limit: 10,
        measured: "1.7 ms",
        because:
            "the shelf is rebuilt when the Library comes back into view and on every keystroke of its search; 500 sources is a serious reading life (#675 L8)",
    },
    "library.pdf.reflow.page": {
        name: "reflow a dense two-column PDF page (961 runs) into paragraphs",
        limit: 30,
        measured: "7.5 ms",
        because:
            "it runs on every page turn in a PDF, between the key and the words; a page must be on screen well within a blink (#681, L8)",
    },
    "library.epub.open.5mb": {
        name: "open a 5 MB EPUB — its directory, package and contents — and rebuild one chapter",
        // Measured with the tests' XML parser; in the app the platform's DOMParser does the parsing.
        limit: 50,
        measured: "3.2 ms",
        because:
            "the wait between choosing a book and its first page; a long book must open as fast as a short note renders (#682, L8)",
    },
    "view.graph.bundle.kb": {
        name: "the built plugin bundle (main.js) in KB, once the graph draws itself",
        // 2,450 → 2,600 (#767): 2,265 KB at #693; the Reader's epic #739 grew it to 2,467 KB before this slice, and
        // Page view adds 36 KB of its own code; a WebGL library coming back is still a megabyte over.
        // 2,600 → 2,700 (#746): 2,555 KB at the Reader's merge (#774); the ink layer (#745) adds 41 KB and
        // a stroke as a highlight 16 KB more — still a megabyte under a WebGL library.
        limit: 2_700,
        measured: "2,613 KB",
        because:
            "the graph engine replaced three.js and 3d-force-graph — 1 MB, 31 % of the plugin (3,251 KB before #693) — with its own WebGL2 renderer; this ceiling is what fails the build if a WebGL library comes back",
    },
    "view.graph.scene.10k": {
        name: "turn the 3D graph's data for 10,000 notes into the typed columns the GPU draws",
        limit: 120,
        measured: "8.7 ms",
        because:
            "it runs once per model revision, on the main thread, between a vault change and the redraw (#693); it must cost a fraction of building the graph data it reads",
    },
    "view.graph.paint.10k": {
        name: "paint every note and link of a 10,000-note graph (one hover)",
        limit: 25,
        measured: "2.1 ms",
        because:
            "a hover, a fade step or an answer rewrites the colour buffers in place (#695); the old view re-digested every object on every hover, and this is the number that keeps that from coming back",
    },
    "view.graph.layout.tick.2k": {
        name: "one tick of the force layout over 2,000 notes (median of 30), in the worker",
        limit: 12,
        measured: "4.6 ms",
        because:
            "d3-force-3d through 3d-force-graph measured 16.8 ms a tick here — a whole frame, on the main thread, for five to nine seconds (#694); the worker keeps it off the main thread and this keeps it cheap",
    },
    "view.graph.layout.tick.10k": {
        name: "one tick of the force layout over 10,000 notes (median of 15), in the worker",
        limit: 90,
        measured: "32 ms",
        because:
            "the old layout measured 131 ms a tick at this size and cooled before it settled; off the main thread a tick may be long, but the picture has to converge in seconds, not minutes (#694)",
    },
    "view.graph.layout.settle.2k": {
        name: "settle the force layout over 2,000 notes from the community seed",
        limit: 3_000,
        measured: "1,311 ms",
        because:
            "how long the picture moves after Explore opens on a new graph (#694) — off the main thread, so a wait and never a stall, and a seed by community is what keeps it short",
    },
    "view.graph.layout.reopen.10k": {
        name: "reopen Explore on an unchanged 10,000-note graph: key the layout and recall it",
        limit: 150,
        measured: "33 ms",
        because:
            "reopening must be instant — the same graph comes back exactly where it was, with no reflow and no second wait (#694); measured under jest, where it is 33 ms (the same call is 0.5 ms warm in plain Node). The limit was 60 and a GitHub runner measured 71 (#700): 150 still reads as instant and leaves CI the headroom the other budgets have",
    },
    "view.home.glimpse.frame.10k": {
        name: "draw one frame of Home's vault glimpse for a 10,000-note vault",
        limit: 2,
        measured: "0.6 ms",
        because:
            "the glimpse is a frame loop on the front door (#705); it samples the vault to a ceiling of points, so a frame must stay a small slice of 16 ms however big the vault is",
    },
    "view.graph.pick.10k": {
        name: "find the note under the pointer among 10,000 (one pointer move)",
        limit: 10,
        measured: "3.6 ms",
        because:
            "a hover projects every note with the GPU's own matrix (#695); no picking buffer to keep in step means this pass is the whole cost of pointing at something",
    },
    "view.graph.labels.10k": {
        name: "rank a 10,000-note answer for its labels and place one frame of them",
        limit: 15,
        measured: "0.09 ms",
        because:
            "labels are a short ranked list on a 2D overlay, never a texture per note (#695); the old view rasterised sprites every 300 ms and never freed them",
    },
    "explore.graphFacts.10k": {
        name: "work out every note's region and which notes join two regions, over 10,000 notes",
        limit: 800,
        measured: "278 ms",
        because:
            "the graph's lenses became questions (#696): region:, bridge, alone and contradiction read these facts. Once per model revision, and the Louvain communities underneath are shared with the graph, so a click never pays it",
    },
    "ink.append.scaling": {
        name: "add points 1,901–2,000 of a stroke, as a multiple of adding points 1–100",
        limit: 2,
        measured: "1.05",
        because:
            "the nib leads (#745 FR-18): smoothing revisits only the last point, so a point costs the same late in a long sentence as at its first letter; a full re-smooth per point would read about 20",
    },
    "ink.layout.200": {
        name: "place 200 ink notes of a chapter at their words after a change of type",
        limit: 20,
        measured: "0.09 ms",
        because:
            "ink moves with its words in the same frame as a change of size or column (#745 FR-22); 200 notes is a heavily annotated chapter, and a frame is 16 ms",
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

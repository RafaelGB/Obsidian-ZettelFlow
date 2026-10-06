import { describe, it } from "@jest/globals";
import { buildShelf, continueReading, viewShelf, type ShelfInputs } from "application/library/shelf";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * Library budgets (epic #675, L8).
 *
 * The shelf is rebuilt every time the Library comes back into view and on every keystroke of its
 * search, so building and viewing it is interaction latency. The other two — a PDF page reflowed,
 * an EPUB opened — are what you wait for when you turn a page or open a book.
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

function shelfInputs(sources: number, paths: number): ShelfInputs {
    const meta: ShelfInputs["meta"] = {};
    const highlights = new Map<string, number>();
    const born = new Map<string, number>();
    const list = [];
    for (let i = 0; i < sources; i++) {
        const path = `Library/${i % 2 ? "Books" : "Papers"}/Source number ${i}.${i % 2 ? "epub" : "pdf"}`;
        list.push({ path, basename: path.split("/").pop() as string });
        meta[path] = { size: i, mtime: i, title: `Source ${i}`, author: `Author ${i % 37}`, chapters: 10 + (i % 300), chapter: i % 9, at: i * 1000 };
        highlights.set(path, i % 13);
        born.set(path, i % 3);
    }
    const saved = Array.from({ length: paths }, (_, i) => ({
        id: `r${i}`,
        name: `Path ${i}`,
        seed: `n${i}.md`,
        paths: Array.from({ length: 12 }, (_, j) => `n${i}-${j}.md`),
        at: i,
    }));
    return { sources: list, meta, saved, highlights, born, pathPlaces: new Map() };
}

describe("the Library (#675)", () => {
    it("library.shelf.500", () => {
        const inputs = shelfInputs(500, 30);
        const ms = best(5, () => {
            const items = buildShelf(inputs);
            continueReading(items);
            viewShelf(items, { filter: "all", sort: "recent", search: "" });
            viewShelf(items, { filter: "all", sort: "highlighted", search: "author 3" });
        });
        assertBudget("library.shelf.500", ms);
    });
});

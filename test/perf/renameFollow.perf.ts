import { describe, it } from "@jest/globals";
import { followSettings, reaboutText } from "application/library/renameFollow";
import { renderThought, type Thought } from "application/thinking/thought";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * A renamed book's follow (#810 T4): what it costs to carry a heavily marked book to its new path —
 * every thought's reference rewritten, and the plugin data a Library at its ceiling keys by path.
 * The vault's own I/O is not here (no Obsidian in this layer); this is the work the follow adds.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

function best(runs: number, work: () => number): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runs; i++) fastest = Math.min(fastest, work());
    return fastest;
}

const BOOK = "Books/A heavily marked book.epub";
const MOVED = "Books/Read/A heavily marked book.epub";

describe("a renamed book's follow (#810)", () => {
    it("rewrites 500 thoughts about a book and moves its keys in a Library at its ceiling", () => {
        const texts = Array.from({ length: 500 }, (_, i) =>
            renderThought({
                id: `t${i}`,
                at: 1700000000000 + i,
                text: `A margin note about passage ${i}, with: colons, "quotes" and a #tag.`,
                links: [],
                about: BOOK,
                quote: { exact: `the passage number ${i}`, prefix: "before ", suffix: " after" },
                locator: { at: i % 30, label: `Chapter ${i % 30}` },
                meaning: "idea",
            } as Thought)
        );
        const library: Record<string, { size: number; mtime: number; chapter: number }> = {};
        for (let i = 0; i < 2000; i++) library[`Books/b${i}.epub`] = { size: i, mtime: i, chapter: 1 };
        library[BOOK] = { size: 1, mtime: 1, chapter: 3 };
        const ms = best(5, () => {
            const started = performance.now();
            for (const text of texts) reaboutText(text, BOOK, MOVED);
            followSettings({ library, readerLayers: { [BOOK]: {} }, readerResume: {} }, BOOK, MOVED);
            return performance.now() - started;
        });
        assertBudget("reader.renameFollow.500", ms);
    });
});

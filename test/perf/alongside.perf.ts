import { describe, it } from "@jest/globals";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { clearMemo } from "architecture/knowledge/model/memo";
import { alongsideVocabulary, buildVocabulary } from "architecture/knowledge/alongside/vocabulary";
import { nearPassage, withNamed, type AlongsideThought } from "architecture/knowledge/alongside/near";
import { alongsideLenses } from "architecture/knowledge/alongside/lenses";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";
import { generateVault } from "./generateVault";

/**
 * Alongside's budgets (#754 FR-15, AC-9).
 *
 * The promise to the reader: on a 10,000-note vault, Alongside has caught up within 100 ms of your
 * reading settling. What runs then is `nearPassage` and the six lenses, over a vocabulary built once
 * per model revision — so the two are timed apart: the settle (warm) and the build (once).
 *
 * The generated vault's titles are `Note 123`, which name nothing (a common word and a number), so
 * each note is given a two-word title from a word list, and every tenth an alias — the shape of a
 * real vault's names, which is what the vocabulary's cost follows.
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

const WORDS = [
    "lantern", "harbour", "planning", "fallacy", "optimism", "forecast", "ledger", "meadow", "cipher", "orchard",
    "compass", "glacier", "quarry", "falcon", "thistle", "beacon", "canyon", "furnace", "marble", "pigment",
    "rhythm", "saddle", "timber", "velvet", "willow", "anchor", "bramble", "cobalt", "delta", "ember",
    "fresco", "garnet", "hollow", "ivory", "juniper", "kernel", "lagoon", "mosaic", "nectar", "oracle",
];

function vault(count: number): KnowledgeModel {
    const snapshots = generateVault(count).map((snapshot, i) => {
        const title = `${WORDS[i % WORDS.length]} ${WORDS[Math.floor(i / WORDS.length) % WORDS.length]} ${i}`;
        return { ...snapshot, title, frontmatter: { ...snapshot.frontmatter, ...(i % 10 === 0 ? { aliases: [`${WORDS[(i * 7) % WORDS.length]} alias ${i}`] } : {}) } };
    });
    const model = new KnowledgeModel();
    model.build(snapshots.map((snapshot) => deriveIdea(snapshot, {})));
    return model;
}

/** A 120-word paragraph that names three of the vault's notes, and a thousand thoughts in Think. */
function passage(model: KnowledgeModel): string {
    const named = [model.all()[3], model.all()[4_242], model.all()[9_001]].map((idea) => idea.title);
    const filler = "the reader turns the page and the argument goes on through the long evening of the chapter".split(" ");
    const words: string[] = [];
    for (let i = 0; words.length < 120; i++) {
        if (i % 37 === 5) words.push(...named[(i / 37) % 3 | 0].split(" "));
        else words.push(filler[i % filler.length]);
    }
    return words.join(" ");
}

function thoughts(model: KnowledgeModel): AlongsideThought[] {
    const ideas = model.all();
    return Array.from({ length: 1_000 }, (_, i) => ({
        id: `t${i}`,
        text: `A thought about ${ideas[(i * 13) % ideas.length].title} and more words after it`,
        about: i % 3 === 0 ? `Books/b${i % 20}.epub` : undefined,
        links: i % 5 === 0 ? [{ to: ideas[(i * 17) % ideas.length].path }] : [],
        highlight: i % 3 === 0,
        title: `Thought ${i}`,
    }));
}

describe("Alongside (#754)", () => {
    it("reader.alongside.vocabulary.10k", () => {
        const model = vault(10_000);
        const ms = best(3, () => buildVocabulary(model));
        assertBudget("reader.alongside.vocabulary.10k", ms);
    });

    it("reader.alongside.near.10k", () => {
        const model = vault(10_000);
        clearMemo(model);
        // Warm, as it is when you read: built once per revision, not on the settle.
        const vocabulary = alongsideVocabulary(model);
        const text = passage(model);
        // Read once when Think's thoughts load, like the vocabulary once per revision.
        const think = withNamed(vocabulary, thoughts(model));
        const born = model.all().slice(100, 140).map((idea, i) => ({ path: idea.path, chapterKey: i % 4 === 0 ? "OEBPS/ch03.xhtml" : "OEBPS/ch09.xhtml", label: `p. ${i}` }));
        const ms = best(5, () => {
            const near = nearPassage(model, vocabulary, { text, book: "Books/b1.epub", bookTitle: "B", chapterKey: "OEBPS/ch03.xhtml", born });
            if (near.length < 3) throw new Error(`the passage names three notes, found ${near.length}`);
            alongsideLenses(model, near, { vocabulary, book: "Books/b1.epub", thoughts: think });
        });
        assertBudget("reader.alongside.near.10k", ms);
    });
});

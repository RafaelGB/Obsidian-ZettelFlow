import { describe, it, expect } from "@jest/globals";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { classifyAll, compileScope, scopeVerdict, type ScopeFacts } from "architecture/knowledge/scope/scopeEvaluate";
import { draftPreview, scopeCensus, scopeVocabulary } from "architecture/knowledge/scope/scopeCensus";
import type { ScopeRules } from "architecture/knowledge/scope/scopeRules";
import { clearSamples, lastSample, measure } from "architecture/monitoring/measure";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";
import { generateVault } from "./generateVault";

/**
 * What is left out, at fifty thousand notes (#713, AC-11).
 *
 * The rules run on every index build and the settings card counts them on every render, so they are
 * interaction latency. The scenario is the shared generated vault (eight folders, skewed tags,
 * lifecycle properties) with a realistic rule set: two folder rules, two nested tag rules, one
 * property rule and one exception.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

const RULES: ScopeRules = {
    leaveOut: [
        { kind: "folder", op: "in", folder: "Inbox", subfolders: true },
        { kind: "folder", op: "in", folder: "Notes/Daily", subfolders: false },
        { kind: "tag", op: "any", tags: ["archive", "someday"], nested: true },
        { kind: "tag", op: "any", tags: ["draft"], nested: true },
        { kind: "property", op: "oneOf", property: "state", values: ["fleeting"] },
    ],
    keep: [{ kind: "tag", op: "any", tags: ["reference"], nested: false }],
};
const SYSTEM = ["_ZettelFlow/folders", "_ZettelFlow/lab"];

function factsOf(count: number): ScopeFacts[] {
    return generateVault(count).map((snapshot) => ({ path: snapshot.path, tags: snapshot.tags, frontmatter: snapshot.frontmatter }));
}

/**
 * Time one pass, after a collection and one warm-up pass: this file runs after the 50k-note suites,
 * and without it the number measured their leftover heap, not the rules (an extra ~60% in the full
 * run, while the same code measured well inside its ceiling alone).
 */
function timed(work: () => unknown): number {
    work();
    global.gc?.();
    const started = performance.now();
    work();
    return performance.now() - started;
}

describe("the scope rules (#713)", () => {
    const facts = factsOf(50_000);

    it("scope.evaluate.50k", () => {
        let out = 0;
        const ms = timed(() => {
            const compiled = compileScope(RULES, SYSTEM);
            for (const note of facts) if (!scopeVerdict(compiled, note).in) out++;
        });
        expect(out).toBeGreaterThan(0);
        expect(out).toBeLessThan(facts.length);
        assertBudget("scope.evaluate.50k", ms);
    });

    it("scope.census.50k", () => {
        const compiled = compileScope(RULES, SYSTEM);
        // Warm up and collect first, as `timed` does: the card's own instrument is what is read.
        scopeCensus(compiled, facts);
        scopeVocabulary(facts);
        global.gc?.();
        clearSamples();
        measure(
            "scope.census",
            () => {
                const census = scopeCensus(compiled, facts);
                const vocabulary = scopeVocabulary(facts);
                expect(census.total).toBe(50_000);
                expect(vocabulary.tags.length).toBeGreaterThan(0);
            },
            { scale: facts.length }
        );
        assertBudget("scope.census.50k", lastSample("scope.census")?.ms ?? Number.POSITIVE_INFINITY);
    });

    it("scope.draft.50k", () => {
        const compiled = compileScope(RULES, SYSTEM);
        // The card classifies the vault once per render; each pick re-evaluates only the draft.
        const classes = classifyAll(compiled, facts);
        let count = 0;
        const ms = timed(() => {
            count = draftPreview(compiled, { kind: "tag", op: "any", tags: ["question"], nested: true }, "leaveOut", facts, -1, classes).count;
        });
        expect(count).toBeGreaterThan(0);
        assertBudget("scope.draft.50k", ms);
    });

    it("index.build.10k.scoped", () => {
        const vault = generateVault(10_000);
        const ms = timed(() => {
            const compiled = compileScope(RULES, SYSTEM);
            const kept = vault.filter((snapshot) => scopeVerdict(compiled, { path: snapshot.path, tags: snapshot.tags, frontmatter: snapshot.frontmatter }).in);
            const model = new KnowledgeModel();
            model.build(kept.map((snapshot) => deriveIdea(snapshot, {})));
            expect(model.size()).toBe(kept.length);
        });
        assertBudget("index.build.10k.scoped", ms);
    });
});

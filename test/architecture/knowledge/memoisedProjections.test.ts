import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { memoStats } from "architecture/knowledge/model/memo";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { computeKnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";

const SRC = join(__dirname, "..", "..", "..", "src");

/** The projections that are memoised, and the file each lives in. */
const MEMOISED: [string, string[]][] = [
    ["findDiscoveries", ["architecture", "knowledge", "discovery", "discoveries.ts"]],
    ["gapTally", ["architecture", "knowledge", "discovery", "discoveries.ts"]],
    ["topGaps", ["architecture", "knowledge", "discovery", "discoveries.ts"]],
    ["computeKnowledgeDebt", ["architecture", "knowledge", "debt", "knowledgeDebt.ts"]],
    ["buildKnowledgeMap", ["architecture", "knowledge", "map", "knowledgeMap.ts"]],
];

/**
 * Anything that reads outside the model cannot be memoised on the model's revision: the key would
 * not change when the answer does.
 */
const AMBIENT = [/\bDate\.now\(/, /new Date\(/, /Math\.random\(/, /ObsidianApi/, /getOwnPlugin/];

function modelOf(count: number): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(
        Array.from({ length: count }, (_, index) =>
            deriveIdea(
                {
                    path: `Notes/${index}.md`,
                    title: `Note ${index}`,
                    created: 1,
                    modified: 1,
                    frontmatter: {},
                    tags: [],
                    outgoingLinks: index > 0 ? [`Notes/${index - 1}.md`] : [],
                    inlineFields: [],
                },
                {}
            )
        )
    );
    return model;
}

describe("the projections that compute once per revision (#458)", () => {
    it("has each of them actually wrapped, at its definition", () => {
        for (const [name, parts] of MEMOISED) {
            const source = readFileSync(join(SRC, ...parts), "utf8");
            // At the definition, not at the State barrel: Home and the dashboard deep-import
            // these, and a barrel-only wrapper would have missed the heaviest callers.
            expect(source).toContain(`export const ${name} = memoise(`);
        }
    });

    it("keeps them pure functions of the model, or the key would be a lie", () => {
        for (const [name, parts] of MEMOISED) {
            const source = readFileSync(join(SRC, ...parts), "utf8");
            for (const pattern of AMBIENT) {
                expect({ name, reads: pattern.test(source) }).toEqual({ name, reads: false });
            }
        }
    });

    it("computes once when a surface renders twice against an unchanged model", () => {
        const model = modelOf(50);
        const first = findDiscoveries(model);
        const entriesAfterFirst = memoStats(model).entries;
        const second = findDiscoveries(model);
        expect(second).toBe(first); // the same object, not merely an equal one
        expect(memoStats(model).entries).toBe(entriesAfterFirst);
    });

    it("gives every projection its own entry, and shares none of them", () => {
        const model = modelOf(50);
        findDiscoveries(model);
        computeKnowledgeDebt(model);
        buildKnowledgeMap(model);
        expect(memoStats(model).entries).toBe(3);
    });

    it("recomputes after a note changes, so a stale answer cannot survive", () => {
        const model = modelOf(50);
        const before = computeKnowledgeDebt(model);
        model.remove("Notes/10.md");
        const after = computeKnowledgeDebt(model);
        expect(after).not.toBe(before);
        expect(after.total).toBe(before.total - 1);
    });

    it("answers a different question differently, rather than reusing the first answer", () => {
        const model = modelOf(50);
        expect(findDiscoveries(model, { limit: 1 })).not.toBe(findDiscoveries(model, { limit: 2 }));
    });
});

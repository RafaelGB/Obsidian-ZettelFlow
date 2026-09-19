import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// test/architecture/components → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const has = (rel: string) => existsSync(join(ROOT, rel));

const SURFACE = [
    "src/architecture/components/core/askGraph/AskGraphRenderer.ts",
    "src/architecture/components/core/askGraph/savedQueries.ts",
    "src/architecture/settings/suggesters/QuerySuggest.ts",
];
const EN = read("src/architecture/lang/locale/en.ts");
const ES = read("src/architecture/lang/locale/es.ts");
const RENDERER = read(SURFACE[0]);

/**
 * **Explore is smaller than Ask was** (#483, epic #481).
 *
 * The epic's whole claim is a subtraction: a form that emitted code, a grammar reference card, a
 * worked-examples list, a redundant lens and two reorder buttons come out, and clicking goes in.
 * Claims like that rot quietly, so they are asserted rather than described.
 */

/** Lines of actual code: comments and blanks are documentation, and documentation is not weight. */
function codeLines(source: string): number {
    let block = false;
    return source.split("\n").filter((raw) => {
        const line = raw.trim();
        if (block) {
            if (line.includes("*/")) block = false;
            return false;
        }
        if (line.startsWith("/*")) {
            if (!line.includes("*/")) block = true;
            return false;
        }
        return line !== "" && !line.startsWith("//") && !line.startsWith("*");
    }).length;
}

/**
 * What the surface weighed before this epic: `AskGraphRenderer` (292) + `graphTermBuilder` (57) +
 * `savedQueries` (72), counted the same way. Explore does strictly more than Ask did — facets,
 * chips, negation, completion, the whole-vault default — and it may not cost more code to do it.
 * If this number has to go up, that is a decision someone takes on purpose, in a visible diff.
 */
const BEFORE = 421;

describe("the surface did not grow (#483)", () => {
    it("does more, with no more code than Ask needed", () => {
        const now = SURFACE.reduce((total, file) => total + codeLines(read(file)), 0);
        expect({ now, ceiling: BEFORE, grew: now > BEFORE }).toEqual({ now, ceiling: BEFORE, grew: false });
    });
});

describe("the form that emitted code is gone (#483)", () => {
    it("has no term builder left, in any form", () => {
        // A form whose output is DSL text does not satisfy §XIII — it conceals the failure.
        expect(has("src/architecture/components/core/askGraph/graphTermBuilder.ts")).toBe(false);
        expect(has("test/architecture/components/core/askGraph/graphTermBuilder.test.ts")).toBe(false);
        expect(RENDERER).not.toContain("buildGraphTerm");
        expect(RENDERER).not.toContain("ask-graph-builder");
    });

    it("leaves no string behind that only the builder read", () => {
        for (const [name, locale] of [["en", EN], ["es", ES]] as const) {
            const orphans = locale
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => /^"?(ask_graph_builder_|ask_graph_field_)/.test(line));
            expect({ locale: name, orphans }).toEqual({ locale: name, orphans: [] });
        }
    });
});

describe("what the surface stopped showing (#483)", () => {
    it("no longer prints a grammar reference card or a list of worked examples", () => {
        // The facets are the examples now, and they carry your own counts. The grammar lives in
        // the docs, which is where a reference for a language you no longer have to write belongs.
        expect(RENDERER).not.toContain("renderPredicateHelp");
        expect(RENDERER).not.toContain("renderExamples");
        expect(EN).not.toContain("ask_graph_examples_heading");
        expect(EN).not.toContain("ask_graph_predicates_heading");
    });

    it("no longer offers a table lens — it was the list, in a grid", () => {
        expect(RENDERER).not.toContain("renderTable");
        expect(EN).not.toContain("ask_graph_col_");
        expect(ES).not.toContain("ask_graph_col_");
    });

    it("no longer offers up and down buttons on a saved query", () => {
        // Careful: "removeSavedQuery" contains "moveSavedQuery". Assert the declaration.
        expect(read(SURFACE[1])).not.toMatch(/export function moveSavedQuery/);
        expect(EN).not.toContain("ask_graph_move_up");
        expect(ES).not.toContain("ask_graph_move_up");
    });
});

describe("what replaced it (#483)", () => {
    it("derives what you can ask from the vault, and a click composes the query", () => {
        expect(RENDERER).toContain("deriveFacets(");
        expect(RENDERER).toContain("toggleTerm(");
        expect(RENDERER).toContain("setTerms(");
    });

    it("keeps negation reachable without typing", () => {
        expect(RENDERER).toContain("invertTerm(");
        expect(RENDERER).toContain("explore_chip_negate");
    });

    it("completes from the grammar and the vault, and from nothing else", () => {
        const suggest = read(SURFACE[2]);
        expect(suggest).toContain("GRAPH_QUERY_PREDICATES");
        expect(suggest).toContain("values()");
        // The third, hardcoded list beside those is exactly how the builder went wrong.
        expect(suggest).not.toMatch(/const [A-Z_]*FIELDS/);
    });

    it("is still read-only — looking never writes", () => {
        expect(RENDERER).not.toMatch(/FileService|FrontmatterService|CultivationService/);
        expect(RENDERER).not.toMatch(/\.(modify|createFile|process[Ff]rontMatter)\(/);
    });
});

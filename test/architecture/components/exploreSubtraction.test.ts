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
 * The ceiling, and its history.
 *
 * This is **not** a record of the smallest the surface has ever been. It is the number someone has
 * to raise on purpose, in a visible diff, with a reason — the only kind of size guardrail that
 * survives contact with a real epic. Each row below is a decision, not a drift:
 *
 * | | code lines | why |
 * |---|---|---|
 * | before #483 | 421 | `AskGraphRenderer` 292 + `graphTermBuilder` 57 + `savedQueries` 72 |
 * | after #483 | 400 | the builder, the grammar card, the examples, the table lens and two reorder buttons came out — and Explore already did strictly more |
 * | after #484 | 444 | the graph lens: mounting it, re-lighting it without a rebuild, a lens bar |
 * | after #485 | 462 | the answer explains itself: which term emptied a selection, and rows that carry the facts you asked about instead of a fixed pair |
 *
 * The honest comparison for the whole epic is **435 → 462**: 421 plus the 14 lines of
 * `GraphSurfaceView`, which #484 deleted and this counter cannot see. Twenty-seven lines bought
 * facets, chips, negation, completion, a whole-vault default, a graph lens and an explaining
 * answer — while a surface, a form that emitted code, a grammar reference card, a worked-examples
 * list, a redundant lens and two buttons went away.
 *
 * Lines here exclude comments: documentation is not weight, and a metric that counts it teaches
 * you to delete the wrong thing.
 */
const CEILING = 462;

describe("the surface does not grow by accident (#483, #484, #485)", () => {
    it("stays under a ceiling that has to be raised deliberately", () => {
        const now = SURFACE.reduce((total, file) => total + codeLines(read(file)), 0);
        expect({ now, ceiling: CEILING, over: now > CEILING }).toEqual({ now, ceiling: CEILING, over: false });
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

    it("switches lens without re-asking the question (#484)", () => {
        // The selection is computed in run() and kept; a lens change only redraws it. A setLens
        // that recomputed would make the graph rebuild its layout every time you glanced at a list.
        const setLens = RENDERER.slice(RENDERER.indexOf("private setLens("));
        const body = setLens.slice(0, setLens.indexOf("\n    }"));
        expect(body).toContain("renderResults()");
        expect(body).not.toContain("this.run()");
        expect(body).not.toContain("matchesFor(");
    });

    it("is still read-only — looking never writes", () => {
        expect(RENDERER).not.toMatch(/FileService|FrontmatterService|CultivationService/);
        expect(RENDERER).not.toMatch(/\.(modify|createFile|process[Ff]rontMatter)\(/);
    });
});

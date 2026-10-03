import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    TEND_ISSUES,
    computeKnowledgeDebt,
    deriveTend,
    filterTend,
    suggestNextMoves,
    tendFocus,
    tendRowsOf,
    type TendRow,
} from "architecture/knowledge/state";
import type { CompanionRequest } from "architecture/components/core/noteCompanion/openNoteCompanion";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const claim = [{ text: "a claim" }];
const sourced = [{ text: "a claim", sources: [{ ref: "Book", kind: "text" as const }] }];

describe("one row per note, every issue as a chip (#644 AC-3, as reworded)", () => {
    // No single note can carry all four issues: an open question is an outgoing `question` link,
    // so it can never also link nowhere. Two notes cover every chip between them.
    const model = buildModel([
        idea("lonely.md", "fleeting", [], { claims: claim, modified: 1 }),
        idea("asks.md", "literature", [{ to: "answer.md", type: "question" }], { claims: claim, modified: 2 }),
        idea("answer.md", "permanent", [], { claims: sourced, hasSources: true }),
    ]);
    const list = tendRowsOf(model);

    it("lists each note once, its issues in chip order, with its state", () => {
        const lonely = list.rows.filter((row) => row.path === "lonely.md");
        expect(lonely).toHaveLength(1);
        expect(lonely[0]).toMatchObject({ state: "fleeting", issues: ["no-source", "links-nowhere", "nobody-links"] });
        expect(list.rows.find((row) => row.path === "asks.md")?.issues).toEqual([
            "no-source",
            "nobody-links",
            "open-question",
        ]);
    });

    it("shows every chip kind across the fixture", () => {
        expect(TEND_ISSUES.every((issue) => list.counts[issue] > 0)).toBe(true);
    });
});

describe("a tended vault (#644 AC-4)", () => {
    it("lists nothing and counts every note as clear", () => {
        const model = buildModel([
            idea("a.md", "permanent", [{ to: "b.md", type: "example" }], { claims: sourced, hasSources: true }),
            idea("b.md", "permanent", [{ to: "a.md", type: "example" }], { claims: sourced, hasSources: true }),
        ]);
        const list = tendRowsOf(model);
        expect(list.rows).toEqual([]);
        expect(Object.values(list.counts)).toEqual([0, 0, 0, 0]);
        expect(list.clear).toBe(model.size());
    });
});

describe("the order (#644 AC-5)", () => {
    it("puts the most issues first, then the most recently changed, then the path", () => {
        const model = buildModel([
            idea("hub.md", "permanent", [{ to: "z.md" }, { to: "y.md" }, { to: "x.md" }], { claims: sourced, hasSources: true }),
            idea("worst.md", "fleeting", [], { claims: claim, modified: 1 }),
            idea("x.md", "permanent", [{ to: "hub.md" }], { claims: claim, modified: 5 }),
            idea("y.md", "permanent", [{ to: "hub.md" }], { claims: claim, modified: 9 }),
            idea("z.md", "permanent", [{ to: "hub.md" }], { claims: claim, modified: 9 }),
        ]);
        expect(tendRowsOf(model).rows.map((row) => row.path)).toEqual(["worst.md", "y.md", "z.md", "x.md"]);
    });
});

describe("counts and filters agree (#644 AC-6)", () => {
    const model = buildModel([
        idea("a.md", "fleeting", [], { claims: claim, modified: 3 }),
        idea("b.md", "fleeting", [{ to: "a.md" }], { claims: claim, modified: 2 }),
        idea("c.md", "fleeting", [{ to: "b.md" }], { modified: 1 }),
    ]);
    const list = tendRowsOf(model);

    it("counts each chip as the rows carrying it", () => {
        for (const issue of TEND_ISSUES) {
            expect({ issue, count: list.counts[issue] }).toEqual({
                issue,
                count: list.rows.filter((row) => row.issues.includes(issue)).length,
            });
        }
    });

    it("filters without re-ordering, and null is everything", () => {
        for (const issue of TEND_ISSUES) {
            expect(filterTend(list, issue)).toEqual(list.rows.filter((row) => row.issues.includes(issue)));
        }
        expect(filterTend(list, null)).toBe(list.rows);
    });
});

describe("where a row hands its note over (#644 AC-7, decision 2)", () => {
    const row = (issues: TendRow["issues"]): TendRow => ({ path: "n.md", title: "n", state: "fleeting", modified: 0, issues });

    it("sends each issue to its fix", () => {
        expect(tendFocus(row(["no-source"]), null)).toEqual({ focus: "next", move: "add-source" });
        expect(tendFocus(row(["links-nowhere"]), null)).toEqual({ focus: "next", move: "connect" });
        expect(tendFocus(row(["nobody-links"]), null)).toEqual({ focus: "nearby" });
        expect(tendFocus(row(["open-question"]), null)).toEqual({ focus: "gaps" });
    });

    it("lets the first issue decide, unless a filter is on", () => {
        expect(tendFocus(row(["no-source", "nobody-links"]), null)).toEqual({ focus: "next", move: "add-source" });
        expect(tendFocus(row(["no-source", "nobody-links"]), "nobody-links")).toEqual({ focus: "nearby" });
    });

    it("is a request the companion accepts as it is", () => {
        const request: CompanionRequest = { path: "n.md", ...tendFocus(row(["open-question"]), null) };
        expect(request).toEqual({ path: "n.md", focus: "gaps" });
    });
});

describe("an issue is an existing answer, never a new one (#644 AC-8, D5)", () => {
    const model = buildModel([
        idea("a.md", "fleeting", [], { claims: claim }),
        idea("b.md", "literature", [{ to: "a.md" }]),
        idea("c.md", "permanent", [{ to: "b.md", type: "supports" }], { claims: sourced, hasSources: true }),
        idea("d.md", "permanent", [{ to: "c.md", type: "question" }]),
        idea("e.md", "permanent", [{ to: "d.md", type: "example" }], { claims: claim }),
        idea("f.md", "fleeting", [{ to: "e.md" }, { to: "a.md" }]),
        idea("g.md", "archived", []),
        idea("h.md", "permanent", [{ to: "g.md" }], { claims: sourced, hasSources: true }),
        idea("i.md", "literature", [{ to: "h.md" }, { to: "j.md" }]),
        idea("j.md", "literature", [{ to: "i.md", type: "question" }], { claims: claim }),
        idea("k.md", "permanent", [{ to: "f.md" }]),
        // Plan risk 1: a note whose only link is to itself. The two functions Tend reads count the
        // self-loop as a link, so neither "links nowhere" nor "nobody links it" lists it.
        idea("self.md", "permanent", [{ to: "self.md" }], { claims: sourced, hasSources: true }),
    ]);
    const list = tendRowsOf(model);
    const debt = computeKnowledgeDebt(model);
    const inCategory = (key: string, path: string) =>
        debt.categories.find((category) => category.key === key)!.paths.includes(path);

    it("agrees with the next moves and the debt categories for every note", () => {
        for (const note of model.all()) {
            const issues = list.rows.find((row) => row.path === note.path)?.issues ?? [];
            const moves = suggestNextMoves(model, note.path);
            expect({ path: note.path, issues }).toEqual({
                path: note.path,
                issues: TEND_ISSUES.filter((issue) =>
                    issue === "no-source"
                        ? moves.includes("add-source")
                        : issue === "links-nowhere"
                          ? moves.includes("connect")
                          : issue === "nobody-links"
                            ? inCategory("unreferenced", note.path)
                            : inCategory("open-question", note.path)
                ),
            });
        }
    });

    it("does not list a note whose only link is to itself", () => {
        expect(list.rows.find((row) => row.path === "self.md")).toBeUndefined();
    });
});

describe("computed once per revision (#644 AC-15, model side)", () => {
    it("hands back the same list until the model changes", () => {
        const model = buildModel([idea("a.md", "fleeting", [], { claims: claim })]);
        const first = deriveTend(model);
        expect(deriveTend(model)).toBe(first);
        model.upsert(idea("b.md", "fleeting", [], { claims: claim }));
        expect(deriveTend(model)).not.toBe(first);
    });

    it("reads the model only — never a note body (FR-12)", () => {
        const source = readFileSync(join(__dirname, "../../../../src/architecture/knowledge/state/tend.ts"), "utf8");
        expect(source).not.toMatch(/cachedRead|vault\.read|JudgementLog/);
    });
});

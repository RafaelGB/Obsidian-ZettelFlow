import { describe, it, expect } from "@jest/globals";
import { unexaminedIdeas, UNEXAMINED_MIN_DEGREE, type Judgement } from "architecture/knowledge/judgement";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const T0 = Date.UTC(2026, 7, 31, 10, 0, 0);

// Each note links to its OWN targets, so a target never accumulates degree from being a shared sink:
// hub (4) and also (3) clear the floor; thin (1) and lonely (0) do not; every leaf sits at degree 1.
const model = buildModel([
    idea("hub.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }, { to: "h3.md" }, { to: "h4.md" }]),
    idea("also.md", "permanent", [{ to: "o1.md" }, { to: "o2.md" }, { to: "o3.md" }]),
    idea("thin.md", "permanent", [{ to: "t1.md" }]),
    idea("lonely.md", "fleeting", []),
    ...["h1", "h2", "h3", "h4", "o1", "o2", "o3", "t1"].map((name) => idea(`${name}.md`, "permanent", [])),
]);


function verdict(path: string): Judgement {
    return { at: T0, path, subject: "challenge-idea", origin: "ai", verdict: "rejected" };
}

describe("unexaminedIdeas (#339, FR-1)", () => {
    it("names the ideas that grew without a verdict, most-connected first", () => {
        expect(unexaminedIdeas(model, []).map((entry) => entry.path)).toEqual(["hub.md", "also.md"]);
    });

    it("treats one verdict as enough — this is not a quota", () => {
        expect(unexaminedIdeas(model, [verdict("hub.md")]).map((entry) => entry.path)).toEqual(["also.md"]);
    });

    it("counts a verdict of any origin, because your reading counts like your ruling", () => {
        const own: Judgement = { at: T0, path: "hub.md", subject: "friction:connect", origin: "derived", verdict: "confirmed" };
        expect(unexaminedIdeas(model, [own]).map((entry) => entry.path)).toEqual(["also.md"]);
    });

    it("leaves thin and brand-new ideas alone — a new note is new, not neglected", () => {
        const paths = unexaminedIdeas(model, []).map((entry) => entry.path);
        expect(paths).not.toContain("thin.md");
        expect(paths).not.toContain("lonely.md");
        expect(UNEXAMINED_MIN_DEGREE).toBeGreaterThan(1);
    });

    it("is empty for an empty model, and for a model where everything has been ruled on", () => {
        expect(unexaminedIdeas(buildModel([]), [])).toEqual([]);
        expect(unexaminedIdeas(model, [verdict("hub.md"), verdict("also.md")])).toEqual([]);
    });

    it("is deterministic", () => {
        expect(unexaminedIdeas(model, [])).toEqual(unexaminedIdeas(model, []));
    });

    it("reports the idea, never a grade about the user", () => {
        const [first] = unexaminedIdeas(model, []);
        const keys = Object.keys(first);

        expect(keys).toContain("path");
        expect(keys).not.toContain("score");
        expect(keys).not.toContain("ratio");
        expect(keys).not.toContain("grade");
    });

    it("honours a caller-supplied limit", () => {
        expect(unexaminedIdeas(model, [], { limit: 1 }).map((entry) => entry.path)).toEqual(["hub.md"]);
    });
});

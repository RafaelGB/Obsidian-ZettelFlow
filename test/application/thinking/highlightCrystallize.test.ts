import { describe, it, expect } from "@jest/globals";
import { citationOf, planCrystallization, renderCrystallized, renderReturn } from "application/thinking/crystallize";
import { parseThought, renderThought, type Thought } from "application/thinking/thought";
import { parseInlineFields } from "architecture/knowledge";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";
import { extractWikilinks } from "architecture/knowledge/relations/wikilink";

function highlight(text = "", heading: string | null = "Events"): Thought {
    return {
        id: "h1",
        at: 1,
        text,
        links: [],
        about: "Notes/Event sourcing.md",
        quote: { exact: "stores changes,\nnot state", prefix: "", suffix: "", ...(heading ? { heading } : {}) },
    };
}

describe("a highlight crystallizes into a note that cites where it was read (#679)", () => {
    it("brings the passage, quoted, then your margin note", () => {
        const plan = planCrystallization([highlight("Like a ledger")])!;
        expect(plan.body).toBe("> stores changes, not state\n\nLike a ledger");
        expect(plan.title).toBe("Like a ledger");
    });

    it("still crystallizes a highlight with no note — the passage is the starting text and title", () => {
        const plan = planCrystallization([highlight("")])!;
        expect(plan.body).toBe("> stores changes, not state");
        expect(plan.title).toBe("stores changes,");
        expect(plan.frozen[0].quote).toBe("stores changes, not state");
    });

    it("cites the note and the heading, as a link with a locator", () => {
        expect(citationOf(highlight())).toBe("[[Notes/Event sourcing#Events]]");
        expect(citationOf(highlight("", null))).toBe("[[Notes/Event sourcing]]");
        expect(citationOf({ id: "p", at: 1, text: "plain", links: [] })).toBeUndefined();
    });

    it("writes the citation as source:: lines after the provenance, once per source", () => {
        const plan = planCrystallization([highlight("one"), { ...highlight("two"), id: "h2", at: 2 }])!;
        const note = renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`);
        expect(note.match(/^source:: \[\[Notes\/Event sourcing#Events\]\]$/gm)).toHaveLength(1);
        expect(note.indexOf("## Born from")).toBeLessThan(note.indexOf("source::"));
    });

    it("is recognised as sourced by the claim/source parser (#148)", () => {
        const plan = planCrystallization([highlight("Like a ledger")])!;
        const body = renderCrystallized(plan, plan.body, "Born from", (n) => n);
        const inlineFields = parseInlineFields(body);
        // Resolved the way the index resolves a `source::` link: by the vault, to the note's path.
        const resolvedTargets = Object.fromEntries(
            inlineFields.flatMap((field) => extractWikilinks(field.value)).map((name) => [name, "Notes/Event sourcing.md"])
        );
        const claims = new ClaimSourceSchema().parse({
            path: "Ideas/Like a ledger.md",
            frontmatter: {},
            inlineFields,
            resolvedTargets,
        } as never);
        expect(claims).toHaveLength(1);
        expect(claims[0].sources).toEqual([{ ref: "Notes/Event sourcing.md", kind: "link" }]);
    });

    it("adds no citation when the thinking goes back into the note it came from", () => {
        const plan = planCrystallization([highlight("Like a ledger")])!;
        expect(renderReturn(plan, plan.body, "Thinking", "Born from", (n) => n)).not.toContain("source::");
    });

    it("leaves a plain thought's note exactly as it was", () => {
        const plan = planCrystallization([{ id: "p", at: 1, text: "plain", links: [] }])!;
        expect(renderCrystallized(plan, plan.body, "Born from", (n) => n)).toBe('plain\n\n## Born from\n- "plain"\n');
    });
});

describe("a change of mind keeps the pair (#679)", () => {
    it("round-trips what it revises — the highlight and its passage", () => {
        const now: Thought = {
            id: "n1",
            at: 2,
            text: "A log, not a ledger",
            links: [],
            about: "Notes/Event sourcing.md",
            respondsTo: { to: "h1", as: "challenge" },
            revises: { of: "h1", quote: 'stores "changes": not state' },
        };
        const back = parseThought(renderThought(now), "Lab/2-n1.md");
        expect(back.revises).toEqual(now.revises);
        expect(back.respondsTo).toEqual(now.respondsTo);
        expect(back.quote).toBeUndefined();
    });
});

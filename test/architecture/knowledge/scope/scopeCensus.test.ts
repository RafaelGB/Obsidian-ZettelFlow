import { describe, it, expect } from "@jest/globals";
import { compileScope, type ScopeFacts } from "architecture/knowledge/scope/scopeEvaluate";
import { draftPreview, scopeCensus, scopeVocabulary, withStoredValues } from "architecture/knowledge/scope/scopeCensus";
import type { ScopeRule } from "architecture/knowledge/scope/scopeRules";

const f = (path: string, tags: string[] = [], frontmatter: Record<string, unknown> | null = null): ScopeFacts => ({ path, tags, frontmatter });

const vault: ScopeFacts[] = [
    f("Templates/Book template.md", ["#template"]),
    f("Templates/Weekly template.md"),
    f("Notes/Recipes template.md", ["#template"]),
    f("Notes/Half-thought.md", ["#draft"]),
    f("Notes/Keeper.md", ["#template", "#evergreen"]),
    f("Notes/Map.md", [], { type: "moc" }),
    f("Notes/Idea.md", ["#idea"], { type: "note", status: ["active", "done"] }),
    f("_ZettelFlow/lab/thought.md", ["#template"]),
];
const rules: ScopeRule[] = [
    { kind: "folder", op: "in", folder: "Templates", subfolders: true },
    { kind: "tag", op: "any", tags: ["template", "draft"], nested: true },
    { kind: "property", op: "oneOf", property: "type", values: ["moc"] },
];
const keep: ScopeRule[] = [{ kind: "tag", op: "any", tags: ["evergreen"], nested: false }];
const compiled = compileScope({ leaveOut: rules, keep }, ["_ZettelFlow/lab"]);

describe("what the card counts (#713, FR-11 to FR-13)", () => {
    const census = scopeCensus(compiled, vault);

    it("adds up: every note is knowledge, left out by a rule, or in ZettelFlow's own folders", () => {
        expect(census.total).toBe(8);
        expect(census.system).toBe(1);
        expect(census.leftOutByRules).toBe(5);
        expect(census.keptByExceptions).toBe(1);
        expect(census.knowledge).toBe(2);
        expect(census.knowledge + census.leftOutByRules + census.system).toBe(census.total);
    });

    it("counts each rule on its own — rules may overlap, so the order never changes a count", () => {
        // Templates/Book template.md is both in Templates and tagged: it counts for both rules.
        expect(census.perRule).toEqual([2, 3, 1]);
        expect(census.perException).toEqual([1]);
    });

    it("groups the left-out notes under the rule that names them, so the groups add up", () => {
        expect(census.groups.map((g) => [g.index, g.paths])).toEqual([
            [0, ["Templates/Book template.md", "Templates/Weekly template.md"]],
            [1, ["Notes/Half-thought.md", "Notes/Recipes template.md"]],
            [2, ["Notes/Map.md"]],
        ]);
        expect(census.groups.reduce((sum, g) => sum + g.paths.length, 0)).toBe(census.leftOutByRules);
    });

    it("says when the rules leave nothing in (FR-15)", () => {
        expect(census.allOut).toBe(false);
        const everything = compileScope({ leaveOut: [{ kind: "folder", op: "notIn", folder: "Nowhere", subfolders: true }], keep: [] }, ["_ZettelFlow/lab"]);
        expect(scopeCensus(everything, vault).allOut).toBe(true);
        expect(scopeCensus(compileScope({ leaveOut: [], keep: [] }, []), []).allOut).toBe(false);
    });
});

describe("a draft says what it would do before it is added (AC-8)", () => {
    it("would leave out exactly what the rule counts once added", () => {
        const draft: ScopeRule = { kind: "tag", op: "any", tags: ["idea", "template"], nested: false };
        const preview = draftPreview(compiled, draft, "leaveOut", vault);
        const after = scopeCensus(compileScope({ leaveOut: [...rules, draft], keep }, ["_ZettelFlow/lab"]), vault);
        expect(preview.count).toBe(after.perRule.at(-1));
        expect(preview.count).toBe(3);
        expect(preview.already).toBe(2); // two of them a rule above already leaves out
        expect(preview.sample).toEqual(["Book template", "Idea", "Recipes template"]);
    });

    it("editing a rule does not count the rule being edited as another one", () => {
        const preview = draftPreview(compiled, rules[2], "leaveOut", vault, 2);
        expect(preview.count).toBe(1);
        expect(preview.already).toBe(0);
    });

    it("an exception says how many notes it would keep", () => {
        const draft: ScopeRule = { kind: "folder", op: "in", folder: "Templates", subfolders: true };
        const preview = draftPreview(compiled, draft, "keep", vault);
        expect(preview.count).toBe(2);
    });
});

describe("what the pickers offer: only what the vault holds, with how many notes (FR-9)", () => {
    const vocab = scopeVocabulary(vault);

    it("counts each tag once per note, most used first, then A–Z", () => {
        expect(vocab.tags).toEqual([
            { name: "template", count: 4 },
            { name: "draft", count: 1 },
            { name: "evergreen", count: 1 },
            { name: "idea", count: 1 },
        ]);
    });

    it("counts properties and their values, never the tags property", () => {
        expect(vocab.properties.map((p) => [p.name, p.count])).toEqual([
            ["type", 2],
            ["status", 1],
        ]);
        expect(vocab.properties[0].values).toEqual([
            { name: "moc", count: 1 },
            { name: "note", count: 1 },
        ]);
        expect(vocab.properties[1].values).toEqual([
            { name: "active", count: 1 },
            { name: "done", count: 1 },
        ]);
    });

    it("keeps a stored value no note carries any more, at zero, so a rule can still be read", () => {
        const kept = withStoredValues(vocab, { kind: "property", op: "oneOf", property: "type", values: ["moc", "archived"] });
        expect(kept.properties[0].values).toContainEqual({ name: "archived", count: 0 });
        const tags = withStoredValues(vocab, { kind: "tag", op: "any", tags: ["gone"], nested: true });
        expect(tags.tags).toContainEqual({ name: "gone", count: 0 });
    });
});

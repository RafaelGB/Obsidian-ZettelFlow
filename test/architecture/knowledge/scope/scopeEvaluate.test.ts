import { describe, it, expect } from "@jest/globals";
import { compileScope, scopeVerdict, type ScopeFacts } from "architecture/knowledge/scope/scopeEvaluate";
import type { ScopeRule, ScopeRules } from "architecture/knowledge/scope/scopeRules";

const facts = (path: string, tags: string[] = [], frontmatter: Record<string, unknown> | null = null): ScopeFacts => ({
    path,
    tags,
    frontmatter,
});
const scope = (leaveOut: ScopeRule[], keep: ScopeRule[] = [], system: string[] = []) =>
    compileScope({ leaveOut, keep } as ScopeRules, system);
const isOut = (compiled: ReturnType<typeof scope>, f: ScopeFacts) => !scopeVerdict(compiled, f).in;

describe("a folder rule (AC-1)", () => {
    const withSub = scope([{ kind: "folder", op: "in", folder: "Templates", subfolders: true }]);

    it("leaves out the folder, its subfolders and its folder note — never a sibling that only starts the same", () => {
        expect(isOut(withSub, facts("Templates/a.md"))).toBe(true);
        expect(isOut(withSub, facts("Templates/sub/b.md"))).toBe(true);
        expect(isOut(withSub, facts("Templates.md"))).toBe(true);
        expect(isOut(withSub, facts("Templates-old/c.md"))).toBe(false);
        expect(isOut(withSub, facts("Notes/Templates/d.md"))).toBe(false);
    });

    it("without subfolders, keeps a note deeper down", () => {
        const flat = scope([{ kind: "folder", op: "in", folder: "Templates", subfolders: false }]);
        expect(isOut(flat, facts("Templates/a.md"))).toBe(true);
        expect(isOut(flat, facts("Templates/sub/b.md"))).toBe(false);
    });

    it("are not in is the exact complement", () => {
        const notIn = scope([{ kind: "folder", op: "notIn", folder: "Templates", subfolders: true }]);
        for (const path of ["Templates/a.md", "Templates/sub/b.md", "Templates.md", "Templates-old/c.md", "x.md"]) {
            expect(isOut(notIn, facts(path))).toBe(!isOut(withSub, facts(path)));
        }
    });
});

describe("a tag rule (AC-2)", () => {
    const any = scope([{ kind: "tag", op: "any", tags: ["project"], nested: true }]);

    it("matches the tag wherever the note carries it, and a nested tag when asked", () => {
        expect(isOut(any, facts("a.md", ["#project"]))).toBe(true);
        expect(isOut(any, facts("b.md", ["#project/alpha"]))).toBe(true);
        expect(isOut(any, facts("c.md", ["#projects"]))).toBe(false);
        const exact = scope([{ kind: "tag", op: "any", tags: ["project"], nested: false }]);
        expect(isOut(exact, facts("b.md", ["#project/alpha"]))).toBe(false);
    });

    it("is case-insensitive, like Obsidian's tags", () => {
        expect(isOut(any, facts("a.md", ["#Project"]))).toBe(true);
    });

    it("have none of these tags is the complement", () => {
        const none = scope([{ kind: "tag", op: "none", tags: ["project"], nested: true }]);
        expect(isOut(none, facts("a.md", ["#project/alpha"]))).toBe(false);
        expect(isOut(none, facts("b.md", ["#other"]))).toBe(true);
        expect(isOut(none, facts("c.md"))).toBe(true);
    });
});

describe("a property rule (AC-3)", () => {
    const oneOf = scope([{ kind: "property", op: "oneOf", property: "status", values: ["archived", "done"] }]);

    it("matches a scalar or any item of a list", () => {
        expect(isOut(oneOf, facts("a.md", [], { status: "archived" }))).toBe(true);
        expect(isOut(oneOf, facts("b.md", [], { status: ["active", "done"] }))).toBe(true);
        expect(isOut(oneOf, facts("c.md", [], { status: "active" }))).toBe(false);
        expect(isOut(oneOf, facts("d.md"))).toBe(false);
    });

    it("is set holds even for an empty value; is not set holds when the key is absent", () => {
        const set = scope([{ kind: "property", op: "set", property: "status", values: [] }]);
        const notSet = scope([{ kind: "property", op: "notSet", property: "status", values: [] }]);
        expect(isOut(set, facts("a.md", [], { status: null }))).toBe(true);
        expect(isOut(set, facts("b.md", [], { other: 1 }))).toBe(false);
        expect(isOut(notSet, facts("b.md", [], { other: 1 }))).toBe(true);
        expect(isOut(notSet, facts("c.md"))).toBe(true);
        expect(isOut(notSet, facts("a.md", [], { status: "" }))).toBe(false);
    });

    it("reads a checkbox as the word it shows", () => {
        const flag = scope([{ kind: "property", op: "oneOf", property: "archived", values: ["true"] }]);
        expect(isOut(flag, facts("a.md", [], { archived: true }))).toBe(true);
        expect(isOut(flag, facts("b.md", [], { archived: false }))).toBe(false);
    });
});

describe("rules and exceptions together (AC-4, AC-5, FR-5)", () => {
    const rules: ScopeRule[] = [
        { kind: "folder", op: "in", folder: "Templates", subfolders: true },
        { kind: "tag", op: "any", tags: ["template"], nested: false },
    ];
    const keep: ScopeRule[] = [{ kind: "tag", op: "any", tags: ["evergreen"], nested: false }];

    it("an exception keeps a note in, whatever a rule says — but never one in ZettelFlow's own folders", () => {
        const compiled = scope(rules, keep, ["_ZettelFlow/folders"]);
        expect(scopeVerdict(compiled, facts("Templates/a.md", ["#evergreen"]))).toEqual({ in: true, keptBy: 0 });
        expect(scopeVerdict(compiled, facts("_ZettelFlow/folders/a.md", ["#evergreen"]))).toEqual({
            in: false,
            by: { kind: "system", folder: "_ZettelFlow/folders" },
            alsoBy: [],
        });
        expect(scopeVerdict(compiled, facts("Ideas/a.md", ["#evergreen"]))).toEqual({ in: true });
    });

    it("names the first rule that leaves a note out, and the others that also would", () => {
        const compiled = scope(rules);
        expect(scopeVerdict(compiled, facts("Templates/a.md", ["#template"]))).toEqual({
            in: false,
            by: { kind: "rule", index: 0 },
            alsoBy: [1],
        });
        expect(scopeVerdict(compiled, facts("Notes/b.md", ["#template"]))).toEqual({
            in: false,
            by: { kind: "rule", index: 1 },
            alsoBy: [],
        });
    });

    it("the order of the rules never changes what is in and what is out", () => {
        const all: ScopeRule[] = [
            ...rules,
            { kind: "property", op: "oneOf", property: "type", values: ["moc"] },
            { kind: "folder", op: "notIn", folder: "Keep", subfolders: true },
        ];
        const notes = Array.from({ length: 200 }, (_, i) =>
            facts(
                [`Templates/${i}.md`, `Keep/${i}.md`, `Notes/${i}.md`][i % 3],
                i % 4 === 0 ? ["#template"] : i % 5 === 0 ? ["#evergreen"] : [],
                i % 7 === 0 ? { type: "moc" } : null
            )
        );
        const baseline = notes.map((f) => scopeVerdict(scope(all, keep), f).in);
        let seed = 7;
        for (let round = 0; round < 20; round++) {
            const shuffled = [...all].sort(() => ((seed = (seed * 9301 + 49297) % 233280) / 233280) - 0.5);
            const keepShuffled = [...keep].reverse();
            expect(notes.map((f) => scopeVerdict(scope(shuffled, keepShuffled), f).in)).toEqual(baseline);
        }
    });

    it("leaves every note in when there are no rules", () => {
        expect(scopeVerdict(scope([]), facts("anything.md", ["#x"], { a: 1 }))).toEqual({ in: true });
    });
});

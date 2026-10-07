import { describe, it, expect } from "@jest/globals";
import {
    EMPTY_SCOPE,
    folderMirror,
    normalizeScopeRules,
    rulesFromExcludedPaths,
    type ScopeRule,
} from "architecture/knowledge/scope/scopeRules";

describe("the stored rule shape (#713) — plain, and never able to break a load", () => {
    it("keeps well-formed rules of the three closed kinds, in order", () => {
        const rules = normalizeScopeRules({
            leaveOut: [
                { kind: "folder", op: "in", folder: "Templates", subfolders: true },
                { kind: "tag", op: "any", tags: ["#Template", "draft"], nested: true },
                { kind: "property", op: "oneOf", property: "type", values: ["moc", "index", "moc"] },
            ],
            keep: [{ kind: "tag", op: "any", tags: ["evergreen"], nested: false }],
        });
        expect(rules.leaveOut).toEqual([
            { kind: "folder", op: "in", folder: "Templates", subfolders: true },
            { kind: "tag", op: "any", tags: ["template", "draft"], nested: true },
            { kind: "property", op: "oneOf", property: "type", values: ["moc", "index"] },
        ]);
        expect(rules.keep).toEqual([{ kind: "tag", op: "any", tags: ["evergreen"], nested: false }]);
    });

    it("drops what it cannot read, and never throws on garbage (a hand-edited data.json)", () => {
        for (const raw of [null, undefined, 42, "x", [], { leaveOut: "no" }]) {
            expect(normalizeScopeRules(raw)).toEqual(EMPTY_SCOPE);
        }
        const rules = normalizeScopeRules({
            leaveOut: [
                null,
                { kind: "formula", expr: "1+1" },
                { kind: "folder", op: "in", folder: "  /", subfolders: true },
                { kind: "tag", op: "any", tags: [], nested: true },
                { kind: "property", op: "oneOf", property: "status", values: [] },
                { kind: "property", op: "set", property: "status" },
                { kind: "folder", op: "sideways", folder: "A", subfolders: true },
            ],
        });
        expect(rules.leaveOut).toEqual([{ kind: "property", op: "set", property: "status", values: [] }]);
    });

    it("unicode-normalises names, so an accented folder or value typed in another form still matches", () => {
        const nfd = "Résumés"; // é as e + combining accent
        const [rule] = normalizeScopeRules({ leaveOut: [{ kind: "folder", op: "in", folder: `/${nfd}/`, subfolders: true }] }).leaveOut;
        expect(rule).toEqual({ kind: "folder", op: "in", folder: "Résumés".normalize("NFC"), subfolders: true });
    });

    it("turns the old excluded folders into folder rules, in order, once each", () => {
        expect(rulesFromExcludedPaths(["Templates", "Archive/Old", "Templates"])).toEqual([
            { kind: "folder", op: "in", folder: "Templates", subfolders: true },
            { kind: "folder", op: "in", folder: "Archive/Old", subfolders: true },
        ]);
    });

    it("mirrors back only what the previous version can express — folder · in · with subfolders", () => {
        const leaveOut: ScopeRule[] = [
            { kind: "folder", op: "in", folder: "Templates", subfolders: true },
            { kind: "folder", op: "in", folder: "Flat", subfolders: false },
            { kind: "folder", op: "notIn", folder: "Notes", subfolders: true },
            { kind: "tag", op: "any", tags: ["draft"], nested: true },
        ];
        expect(folderMirror(leaveOut)).toEqual(["Templates"]);
    });
});

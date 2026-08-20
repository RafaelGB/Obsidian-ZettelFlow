import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { ACTION_KINDS, isActionKind } from "architecture/knowledge/taxonomy/actionKind";

describe("ActionKind marker types (#265, FR-1/FR-10, AC-6)", () => {
    it("narrows to command | query", () => {
        expect([...ACTION_KINDS].sort()).toEqual(["command", "query"]);
        expect(isActionKind("command")).toBe(true);
        expect(isActionKind("query")).toBe(true);
        expect(isActionKind("nope")).toBe(false);
        expect(isActionKind(undefined)).toBe(false);
    });

    it("the taxonomy module imports no platform API and not the knowledge barrel (§XI)", () => {
        const src = readFileSync(
            join(__dirname, "..", "..", "..", "..", "src", "architecture", "knowledge", "taxonomy", "actionKind.ts"),
            "utf8"
        );
        const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
        expect(importLines).not.toMatch(/from\s+["']obsidian["']/);
        expect(importLines).not.toMatch(/from\s+["']architecture\/knowledge["']/);
    });
});

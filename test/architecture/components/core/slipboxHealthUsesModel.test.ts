import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
    join(__dirname, "..", "..", "..", "..", "src", "architecture", "components", "core", "slipboxHealth", "SlipboxHealthRenderer.ts"),
    "utf8"
);

describe("Health renderer feeds the model to classifyHealth (#274, AC-7)", () => {
    it("classifies health from the model", () => {
        expect(src).toMatch(/classifyHealth\(model\)/);
    });

    it("no longer assembles the raw Obsidian link graph", () => {
        expect(src).not.toMatch(/resolvedLinks/);
        expect(src).not.toMatch(/unresolvedLinks/);
        expect(src).not.toMatch(/getMarkdownFiles/);
        expect(src).not.toMatch(/LinkGraph/);
    });
});

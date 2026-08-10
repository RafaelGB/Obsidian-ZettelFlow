import { describe, it, expect } from "@jest/globals";
import { parseInlineFields } from "architecture/knowledge/parse/inlineFields";

describe("parseInlineFields", () => {
    it("parses a full-line field", () => {
        expect(parseInlineFields("supports:: [[Atomic Habits]]")).toEqual([
            { key: "supports", value: "[[Atomic Habits]]" },
        ]);
    });

    it("parses several bracketed fields on one line", () => {
        expect(parseInlineFields("text [a:: 1] more (b:: 2)")).toEqual([
            { key: "a", value: "1" },
            { key: "b", value: "2" },
        ]);
    });

    it("keeps a colon inside the value (time:: 10:30)", () => {
        expect(parseInlineFields("time:: 10:30")).toEqual([{ key: "time", value: "10:30" }]);
    });

    it("does not treat a single-colon URL as a field", () => {
        expect(parseInlineFields("see http://example.com for more")).toEqual([]);
    });

    it("ignores fenced code blocks", () => {
        const body = ["```", "key:: value", "```", "real:: yes"].join("\n");
        expect(parseInlineFields(body)).toEqual([{ key: "real", value: "yes" }]);
    });

    it("parses a field under a list marker", () => {
        expect(parseInlineFields("- source:: Deep Work")).toEqual([
            { key: "source", value: "Deep Work" },
        ]);
    });

    it("returns nothing for empty input", () => {
        expect(parseInlineFields("")).toEqual([]);
    });
});

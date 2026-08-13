import { describe, it, expect } from "@jest/globals";
import { buildSynthesisPrompt, extractWikilinks } from "actions/ai/synthesizeLogic";

describe("synthesize logic (#184)", () => {
    describe("extractWikilinks", () => {
        it("collects distinct note names, stripping alias and heading", () => {
            const content = "See [[Sleep]], [[Memory#Encoding]] and [[Notes|my notes]]. Again [[Sleep]].";
            expect(extractWikilinks(content)).toEqual(["Sleep", "Memory", "Notes"]);
        });

        it("returns [] when there are no wikilinks", () => {
            expect(extractWikilinks("plain text, no links")).toEqual([]);
        });
    });

    describe("buildSynthesisPrompt", () => {
        it("titles each source block and asks for a synthesis", () => {
            const prompt = buildSynthesisPrompt([
                { title: "Sleep", content: "Sleep consolidates memory." },
                { title: "Focus", content: "Attention gates encoding." },
            ]);
            expect(prompt).toContain("## Sleep");
            expect(prompt).toContain("## Focus");
            expect(prompt).toContain("Sleep consolidates memory.");
            expect(prompt.toLowerCase()).toContain("synthesize");
        });
    });
});

import { describe, it, expect } from "@jest/globals";
import { detectDevelopmentEvents } from "architecture/knowledge/journal/developmentEvents";
import { idea } from "../../../actions/knowledge/support/knowledgeFixture";

describe("detectDevelopmentEvents (#162, FR-1..3, AC-1)", () => {
    it("returns [] for a brand-new note (creation is not development)", () => {
        expect(detectDevelopmentEvents(undefined, idea("a.md", "permanent"))).toEqual([]);
    });

    it("detects state-advanced when the lifecycle state factor rises", () => {
        expect(detectDevelopmentEvents(idea("a.md", "fleeting"), idea("a.md", "permanent"))).toEqual([
            "state-advanced",
        ]);
    });

    it("ignores a downgrade, a lateral move, and an unknown→unknown move", () => {
        expect(detectDevelopmentEvents(idea("a.md", "permanent"), idea("a.md", "fleeting"))).toEqual([]);
        expect(detectDevelopmentEvents(idea("a.md", "permanent"), idea("a.md", "permanent"))).toEqual([]);
        expect(detectDevelopmentEvents(idea("a.md", "made-up"), idea("a.md", "made-up"))).toEqual([]);
    });

    it("detects source-added on the first source", () => {
        expect(
            detectDevelopmentEvents(idea("a.md", "permanent"), idea("a.md", "permanent", [], { hasSources: true }))
        ).toEqual(["source-added"]);
    });

    it("detects connection-added when outgoing degree grows", () => {
        expect(
            detectDevelopmentEvents(
                idea("a.md", "permanent", [{ to: "x.md" }]),
                idea("a.md", "permanent", [{ to: "x.md" }, { to: "y.md" }])
            )
        ).toEqual(["connection-added"]);
    });

    it("emits all three in canonical order for a triple transition", () => {
        expect(
            detectDevelopmentEvents(
                idea("a.md", "fleeting", [{ to: "x.md" }]),
                idea("a.md", "permanent", [{ to: "x.md" }, { to: "y.md" }], { hasSources: true })
            )
        ).toEqual(["state-advanced", "source-added", "connection-added"]);
    });
});

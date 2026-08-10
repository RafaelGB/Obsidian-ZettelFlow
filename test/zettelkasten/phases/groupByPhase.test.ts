import { describe, it, expect } from "@jest/globals";
import { groupOptionsByPhase, StepPhase } from "zettelkasten/phases";

type Opt = { key: string; phase?: StepPhase };

describe("groupOptionsByPhase (#149)", () => {
    it("returns null when NO option carries a phase (flat/legacy list, AC-1)", () => {
        const opts: Opt[] = [{ key: "a" }, { key: "b" }];
        expect(groupOptionsByPhase(opts)).toBeNull();
    });

    it("groups by phase in canonical order with the unphased group last (AC-3)", () => {
        const opts: Opt[] = [
            { key: "a", phase: "DEVELOP" },
            { key: "b", phase: "CAPTURE" },
            { key: "c" },
            { key: "d", phase: "CAPTURE" },
        ];
        const groups = groupOptionsByPhase(opts)!;
        expect(groups.map((g) => g.phase)).toEqual(["CAPTURE", "DEVELOP", null]);
        expect(groups[0].options.map((o) => o.key)).toEqual(["b", "d"]);
        expect(groups[2].options.map((o) => o.key)).toEqual(["c"]);
    });

    it("omits empty phase groups and the unphased group when everything is phased", () => {
        const opts: Opt[] = [{ key: "a", phase: "REVIEW" }];
        const groups = groupOptionsByPhase(opts)!;
        expect(groups.map((g) => g.phase)).toEqual(["REVIEW"]);
    });
});

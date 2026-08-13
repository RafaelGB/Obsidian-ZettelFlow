import { describe, it, expect } from "@jest/globals";
import { nextSession } from "architecture/knowledge/home/nextSession";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

describe("nextSession (#172, AC-2)", () => {
    it("picks the highest-leverage note — connected but under-developed", () => {
        // top: fleeting (factor 0) degree 2 → score 2. mature: permanent (0.8) degree 3 → 0.6. iso → 0.
        const model = buildModel([
            idea("top.md", "fleeting", [{ to: "a.md" }, { to: "b.md" }]),
            idea("mature.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }]),
            idea("iso.md", "fleeting", []),
            idea("a.md", "permanent", []),
            idea("b.md", "permanent", []),
            idea("c.md", "permanent", []),
        ]);
        expect(nextSession(model)).toEqual({ path: "top.md", reason: "develop-hub" });
    });

    it("breaks a score tie by path ascending", () => {
        const model = buildModel([
            idea("zzz.md", "fleeting", [{ to: "x.md" }]),
            idea("aaa.md", "fleeting", [{ to: "x.md" }]),
            idea("x.md", "permanent", []),
        ]);
        expect(nextSession(model)).toEqual({ path: "aaa.md", reason: "develop-hub" });
    });

    it("returns null for an empty, all-evergreen, or all-isolated model, read-only", () => {
        expect(nextSession(buildModel([]))).toBeNull();
        expect(
            nextSession(buildModel([idea("e.md", "evergreen", [{ to: "f.md" }]), idea("f.md", "evergreen", [])]))
        ).toBeNull();
        const isolated = buildModel([idea("i1.md", "fleeting", []), idea("i2.md", "permanent", [])]);
        const before = isolated.size();
        expect(nextSession(isolated)).toBeNull();
        expect(isolated.size()).toBe(before);
    });
});

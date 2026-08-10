import { describe, it, expect } from "@jest/globals";
import { canTransition, allowedTargets } from "architecture/knowledge/lifecycle/machine";
import { LIFECYCLE_STATES } from "architecture/knowledge/lifecycle/states";

const ALLOWED_EDGES = new Set<string>([
    "fleeting->literature",
    "fleeting->permanent",
    "fleeting->archived",
    "literature->permanent",
    "literature->archived",
    "permanent->developing",
    "permanent->archived",
    "developing->evergreen",
    "developing->archived",
    "evergreen->developing",
    "evergreen->archived",
    "archived->fleeting",
]);

describe("lifecycle state machine (AC-4)", () => {
    it("canTransition is true for exactly the 12 allowed edges over all 36 pairs", () => {
        expect(ALLOWED_EDGES.size).toBe(12);
        for (const from of LIFECYCLE_STATES) {
            for (const to of LIFECYCLE_STATES) {
                expect(canTransition(from, to)).toBe(ALLOWED_EDGES.has(`${from}->${to}`));
            }
        }
    });

    it("rejects skip-ahead, self->self and demotions", () => {
        expect(canTransition("fleeting", "developing")).toBe(false); // skip ahead
        expect(canTransition("permanent", "permanent")).toBe(false); // self
        expect(canTransition("permanent", "literature")).toBe(false); // demotion
    });

    it("allowedTargets returns the exact set per state", () => {
        expect(allowedTargets("fleeting").sort()).toEqual(["archived", "literature", "permanent"]);
        expect(allowedTargets("evergreen").sort()).toEqual(["archived", "developing"]);
        expect(allowedTargets("archived")).toEqual(["fleeting"]);
    });
});

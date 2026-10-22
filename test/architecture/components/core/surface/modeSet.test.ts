import { describe, it, expect } from "@jest/globals";
import { centeredScrollTop, doors, escapeIsFree, NO_DOORS, panPlan, shotPlan } from "architecture/components/core/surface/modeSet";

const ORDER = ["home", "cultivate", "lab"];

describe("the camera's way across the set (#875 FR-1, FR-2, AC-1)", () => {
    it("moves right to a later mode, left to an earlier one, and names what it passes", () => {
        expect(panPlan(ORDER, "home", "lab")).toEqual({ from: 0, to: 2, direction: "right", passes: ["cultivate"] });
        expect(panPlan(ORDER, "lab", "home")).toEqual({ from: 2, to: 0, direction: "left", passes: ["cultivate"] });
        expect(panPlan(ORDER, "home", "cultivate").passes).toEqual([]);
        expect(panPlan(ORDER, "lab", "lab").direction).toBe("none");
    });

    it("has nowhere to come from on a first open", () => {
        expect(panPlan(ORDER, "", "lab")).toEqual({ from: -1, to: 2, direction: "none", passes: [] });
    });
});

describe("which shot a move gets (#875 FR-9, FR-16, FR-18)", () => {
    it("lands a deep link or a restored layout with no shot at all", () => {
        expect(shotPlan({ motion: true, via: "link", landing: true })).toBe("instant");
    });

    it("is instant under reduced motion, whatever asked for it", () => {
        for (const via of ["bar", "door", "back"] as const) expect(shotPlan({ motion: false, via, landing: true })).toBe("instant");
    });

    it("flies the card only when there is a place for it to land", () => {
        expect(shotPlan({ motion: true, via: "door", landing: true })).toBe("pan+flight");
        expect(shotPlan({ motion: true, via: "door", landing: false })).toBe("pan");
        expect(shotPlan({ motion: true, via: "back", landing: true })).toBe("pan+flight");
        expect(shotPlan({ motion: true, via: "bar", landing: true })).toBe("pan");
    });
});

describe("the way back is to the card you pressed (#875 FR-13, AC-10)", () => {
    it("offers back once after a door, and then not again", () => {
        let state = doors(NO_DOORS, { kind: "door", from: "home", to: "lab", origin: "last-thought" });
        expect(state.back).toEqual({ to: "home", origin: "last-thought" });
        state = doors(state, { kind: "back" });
        expect(state.back).toBeNull();
    });

    it("forgets the door when you move by the bar or something opens a mode from outside", () => {
        const opened = doors(NO_DOORS, { kind: "door", from: "home", to: "cultivate", origin: "idea-to-tend" });
        expect(doors(opened, { kind: "bar" }).back).toBeNull();
        expect(doors(opened, { kind: "link" }).back).toBeNull();
    });

    it("never makes a way back out of the bar", () => {
        expect(doors(NO_DOORS, { kind: "bar" }).back).toBeNull();
    });
});

describe("Esc goes back only when nothing else wants it (#875 FR-12, AC-8, AC-9)", () => {
    const free = { writing: false, insideView: true, overlayOpen: false, modeClaims: false };

    it("is free with the focus on the view and nothing open", () => {
        expect(escapeIsFree(free)).toBe(true);
    });

    it("belongs to a text box, an open menu or a mode that uses it", () => {
        expect(escapeIsFree({ ...free, writing: true })).toBe(false);
        expect(escapeIsFree({ ...free, overlayOpen: true })).toBe(false);
        expect(escapeIsFree({ ...free, modeClaims: true })).toBe(false);
        expect(escapeIsFree({ ...free, insideView: false })).toBe(false);
    });
});

describe("a landing scrolled into view by number (#875 Risk 1)", () => {
    it("centres the entry, clamped to the pane", () => {
        expect(centeredScrollTop(900, 100, 600, 3000)).toBe(650);
        expect(centeredScrollTop(50, 100, 600, 3000)).toBe(0);
        expect(centeredScrollTop(2950, 100, 600, 3000)).toBe(2400);
        expect(centeredScrollTop(10, 10, 600, 300)).toBe(0);
    });
});

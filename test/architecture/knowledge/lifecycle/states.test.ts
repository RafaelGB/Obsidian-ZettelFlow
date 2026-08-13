import { describe, it, expect } from "@jest/globals";
import {
    LIFECYCLE_STATES,
    STATE_EMOJI,
    FALLBACK_STATE,
    DEFAULT_STATE_PROPERTY,
    DEFAULT_CREATED_PROPERTY,
    DEFAULT_LAST_REVIEWED_PROPERTY,
    normalize,
    isLifecycleState,
} from "architecture/knowledge/lifecycle/states";

describe("lifecycle vocabulary (FR-1)", () => {
    it("has the six states in lifecycle order", () => {
        expect(LIFECYCLE_STATES).toEqual([
            "fleeting",
            "literature",
            "permanent",
            "developing",
            "evergreen",
            "archived",
        ]);
    });

    it("maps every state to a display emoji (total map)", () => {
        for (const state of LIFECYCLE_STATES) {
            expect(STATE_EMOJI[state]).toBeTruthy();
        }
    });

    it("uses fleeting as the fallback (decision #1)", () => {
        expect(FALLBACK_STATE).toBe("fleeting");
    });

    it("exposes the default property names", () => {
        expect(DEFAULT_STATE_PROPERTY).toBe("state");
        expect(DEFAULT_CREATED_PROPERTY).toBe("created");
        expect(DEFAULT_LAST_REVIEWED_PROPERTY).toBe("last-reviewed");
    });

    it("normalize strips a leading emoji, trims and lowercases", () => {
        expect(normalize("  Permanent ")).toBe("permanent");
        expect(normalize("💡 Permanent")).toBe("permanent");
        expect(normalize("🌱Fleeting")).toBe("fleeting");
    });

    it("isLifecycleState recognises only real tokens", () => {
        expect(isLifecycleState("permanent")).toBe(true);
        expect(isLifecycleState("nope")).toBe(false);
    });
});

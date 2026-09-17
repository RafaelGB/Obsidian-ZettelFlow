import { describe, it, expect } from "@jest/globals";
import {
    applyErrorPolicy,
    interrupts,
    POLICY_DESCRIPTION_KEY,
    POLICY_LABEL_KEY,
    SCRIPT_ERROR_POLICIES,
} from "application/scripts/errorPolicy";

describe("a failing script does what its script says (#445)", () => {
    it("tells you and carries on, by default", () => {
        expect(applyErrorPolicy(undefined)).toEqual({ notify: true, skipStep: false, stopBuild: false });
        expect(applyErrorPolicy("notify")).toEqual(applyErrorPolicy(undefined));
    });

    it("stays quiet without hiding anything else", () => {
        // Silent is about not interrupting you; the run is still recorded (#444).
        expect(applyErrorPolicy("silent")).toEqual({ notify: false, skipStep: false, stopBuild: false });
    });

    it("abandons the step, or the whole note", () => {
        expect(applyErrorPolicy("skip")).toEqual({ notify: true, skipStep: true, stopBuild: false });
        expect(applyErrorPolicy("stop")).toEqual({ notify: true, skipStep: false, stopBuild: true });
    });

    it("treats a value it does not know as the default rather than as a surprise", () => {
        expect(applyErrorPolicy("whatever" as never)).toEqual(applyErrorPolicy(undefined));
    });

    it("says which policies change the work around the script", () => {
        expect(interrupts("notify")).toBe(false);
        expect(interrupts("silent")).toBe(false);
        expect(interrupts("skip")).toBe(true);
        expect(interrupts("stop")).toBe(true);
    });

    it("names every policy in both maps, so the form cannot render a blank", () => {
        for (const policy of SCRIPT_ERROR_POLICIES) {
            expect(POLICY_LABEL_KEY[policy]).toMatch(/^script_policy_/);
            expect(POLICY_DESCRIPTION_KEY[policy]).toMatch(/^script_policy_/);
        }
    });
});

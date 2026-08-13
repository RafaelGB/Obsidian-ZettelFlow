import { describe, it, expect } from "@jest/globals";
import { resolveOnCreationActions } from "application/patterns/resolveOnCreationActions";
import type { StepSettings } from "zettelkasten";
import type { Action } from "architecture/api";

const action = (id: string): Action => ({ type: id, id, hasUI: false, key: id, zone: "frontmatter" });

function baseSettings(extra: Partial<StepSettings> = {}): StepSettings {
    return { root: false, actions: [], label: "Step", ...extra };
}

describe("resolveOnCreationActions (#170, AC-1/AC-2)", () => {
    it("returns the attached on-creation actions in declared order (AC-1)", () => {
        const a = action("find-related");
        const b = action("calculate-maturity");
        expect(resolveOnCreationActions(baseSettings({ onCreation: [a, b] }))).toEqual([a, b]);
    });

    it("returns [] for a legacy template with no onCreation, without mutating it (AC-2)", () => {
        const legacy = baseSettings();
        const clone = JSON.parse(JSON.stringify(legacy));
        expect(resolveOnCreationActions(legacy)).toEqual([]);
        expect(legacy).toEqual(clone);
        expect("onCreation" in legacy).toBe(false);
    });

    it("returns [] for an explicitly empty onCreation", () => {
        expect(resolveOnCreationActions(baseSettings({ onCreation: [] }))).toEqual([]);
    });
});

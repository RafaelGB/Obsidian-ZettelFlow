import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";

describe("installedPackages settings default (#174, FR-6)", () => {
    it("defaults to an empty record", () => {
        expect(DEFAULT_SETTINGS.installedPackages).toEqual({});
    });

    it("seeds {} for a legacy data.json lacking the key (Object.assign merge)", () => {
        const legacy = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
        delete legacy.installedPackages;
        const merged = Object.assign({}, DEFAULT_SETTINGS, legacy) as typeof DEFAULT_SETTINGS;
        expect(merged.installedPackages).toEqual({});
    });
});

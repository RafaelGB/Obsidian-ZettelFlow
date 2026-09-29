import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_SETTINGS } from "config/typing";

// test/config → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the Cultivate stage preference (#589, FR-7 / AC-8)", () => {
    it("defaults to any stage — the selector ships with a working default (§XIII)", () => {
        expect(DEFAULT_SETTINGS.cultivateStage).toBe("any");
    });

    it("is declared on the settings type", () => {
        expect(read("src/config/typing.ts")).toMatch(/cultivateStage\?:\s*string/);
    });
});

describe("the Cultivate surface wires the stage (#589, AC-2 / AC-8)", () => {
    const renderer = read("src/architecture/components/core/cultivate/CultivateModeRenderer.ts");

    it("reads, filters by, and persists the chosen stage", () => {
        expect(renderer).toMatch(/settings\.cultivateStage\s*\?\?\s*"any"/); // reads it; undefined = any
        expect(renderer).toMatch(/settings\.cultivateStage\s*=/); // writes it back
        expect(renderer).toContain("saveSettings");
        expect(renderer).toMatch(/selectCultivationTarget\(model,[^;]*stage/); // the filter reaches selection
        expect(renderer).toMatch(/cultivationQueue\(model,[^;]*stage/);
    });

    it("shows the distribution and an empty-stage state, built with createEl (not innerHTML)", () => {
        expect(renderer).toContain("stageDistribution");
        expect(renderer).toContain("cultivate-dist-bar--l");
        expect(renderer).toContain('t("cultivate_empty_stage")');
        expect(renderer).toContain('"emptyStage"');
        expect(renderer).not.toContain("innerHTML");
    });
});

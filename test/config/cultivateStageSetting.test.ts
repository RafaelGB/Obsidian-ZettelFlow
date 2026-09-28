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

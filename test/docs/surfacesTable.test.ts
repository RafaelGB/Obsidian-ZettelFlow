import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

// test/docs → 2 ups → repo root
const ARCH = join(__dirname, "..", "..", "docs", "architecture");
const SURFACES_PAGE = readFileSync(join(ARCH, "surfaces.md"), "utf8");
const REVERSIBILITY = readFileSync(join(ARCH, "reversibility.md"), "utf8");
const label = (key: string) => (en as Record<string, string>)[key];

/**
 * **The surfaces table is the registry** (#800 D3, D4, AC-3). Home listed a *Recent* mode two
 * releases after #511 removed it, and the reversibility page named it as the record's reader.
 */
describe("the surfaces table matches SURFACES (#800)", () => {
    it.each(SURFACES.map((surface) => [label(surface.titleKey), surface]))("lists %s's modes as the registry does", (title, surface) => {
        const row = SURFACES_PAGE.split(/\r?\n/).find((line) => line.startsWith("| ") && (line.includes(`**${title}**`) || line.includes(`**[${title}](`)));
        expect(row).toBeDefined();
        if (surface.modes.length < 2) return; // One mode, no mode bar: the row says so in words.
        const modes = row!.split("|")[2].trim().split(" · ");
        expect(modes).toEqual(surface.modes.map((mode) => label(mode.labelKey)));
    });

    it.each([
        ["surfaces.md", SURFACES_PAGE],
        ["reversibility.md", REVERSIBILITY],
    ])("%s names no Recent mode", (_name, page) => {
        expect(page).not.toMatch(/Home\/Recent|\*\*Recent\*\* mode|· Recent\b/);
    });
});

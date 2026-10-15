import { describe, it, expect } from "@jest/globals";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

// test/docs → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const BUNDLE = join(ROOT, "dist", "main.js");
const CATALOG = join(ROOT, "docs", "learn", "catalog.json");

/**
 * **The tutorials are not in the bundle** (#801 AC-3). They live on GitHub raw so a tutorial merged
 * to `main` reaches every user with no release, and so `main.js` — whose size is the first-launch
 * cost under an antivirus scan — does not grow with them. The plugin knows the catalog's path, in
 * one place, and nothing of its content.
 */
const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { tutorials: Record<string, { title: { en: string } }> };
const TITLE = catalog.tutorials["contribute-a-system"].title.en;
const PATH = "docs/learn/catalog.json";
const PATH_HOME = "src/application/community/services/CommunityHttpClientService.ts";

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? files(full) : [full];
    });
}

describe("the Learn catalog is fetched, never bundled (#801 AC-3)", () => {
    const sources = files(SRC).map((file) => ({ file: relative(ROOT, file).split(sep).join("/"), text: readFileSync(file, "utf8") }));

    it("has no tutorial title in src", () => {
        expect(TITLE.length).toBeGreaterThan(10);
        expect(sources.filter((source) => source.text.includes(TITLE)).map((source) => source.file)).toEqual([]);
    });

    it("names the catalog's path in the HTTP client only", () => {
        expect(sources.filter((source) => source.text.includes(PATH)).map((source) => source.file)).toEqual([PATH_HOME]);
    });

    it("leaves the built main.js without it, when there is one", () => {
        if (!existsSync(BUNDLE)) return;
        expect(readFileSync(BUNDLE, "utf8").includes(TITLE)).toBe(false);
    });
});

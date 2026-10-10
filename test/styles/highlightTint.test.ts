import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");

function sheets(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sheets(path);
        return entry.name.endsWith(".scss") ? [path] : [];
    });
}

/** The safe chain: Obsidian 1.14's variable first, the one older versions define second. */
const CHAIN = "var(--highlight-background, var(--text-highlight-bg))";

/**
 * Every `--text-highlight-bg` that is not reached through the safe chain.
 *
 * Obsidian 1.14 stopped defining `--text-highlight-bg` on the body: it now only *reads* it, as
 * the theme's override of `--highlight-background`. A rule that names the old variable alone
 * draws no tint on 1.14 — the reader's search matches were invisible (#770).
 */
function bareUses(source: string): string[] {
    const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    return withoutComments
        .split("\n")
        .filter((line) => line.includes("--text-highlight-bg"))
        .filter((line) => line.split("--text-highlight-bg").length - 1 > line.split(CHAIN).length - 1)
        .map((line) => line.trim());
}

describe("a highlight tint survives Obsidian 1.14", () => {
    const files = sheets(STYLES);

    it("reads every stylesheet, not a corner of them", () => {
        expect(files.length).toBeGreaterThan(30);
    });

    it("never names --text-highlight-bg outside the 1.14-first chain", () => {
        const offenders = files.flatMap((file) =>
            bareUses(readFileSync(file, "utf8")).map((line) => `${file}: ${line}`)
        );
        expect(offenders).toEqual([]);
    });

    it("tells a bare use from the chain", () => {
        expect(bareUses("background-color: var(--text-highlight-bg);")).toHaveLength(1);
        expect(bareUses("color: var(--zf-ink, var(--text-highlight-bg));")).toHaveLength(1);
        expect(bareUses(`background-color: ${CHAIN};`)).toEqual([]);
        expect(bareUses(`background-color: var(--zf-ink, ${CHAIN});`)).toEqual([]);
        expect(bareUses(`background-image: linear-gradient(${CHAIN}, var(--text-highlight-bg));`))
            .toHaveLength(1);
    });
});

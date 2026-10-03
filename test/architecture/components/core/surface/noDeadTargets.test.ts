import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..", "..", "..", "..", "..", "src");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * No door points at a room that is gone (#644 AC-17).
 *
 * The old Health mode's recommendation table still sent clicks to the Discovery surface, dissolved
 * in #504, and to its own `health` mode. Those now exist only as entries the redirect map turns
 * into somewhere real; anywhere else they are a dead end the user would hit.
 */
describe("no navigation target names a surface or mode that no longer exists (#644)", () => {
    const files = sources(SRC).filter((file) => !file.endsWith("legacyTargets.ts"));

    it("reads the whole source tree", () => {
        expect(files.length).toBeGreaterThan(200);
    });

    it("never opens Discovery, nor Health's retired health mode", () => {
        const offenders = files.flatMap((file) => {
            const source = readFileSync(file, "utf8");
            return [/"zettelflow-discovery"/, /mode:\s*"health"/, /zettelflow-health:health/]
                .filter((pattern) => pattern.test(source))
                .map((pattern) => `${relative(SRC, file)} ~ ${pattern}`);
        });
        expect(offenders).toEqual([]);
    });
});

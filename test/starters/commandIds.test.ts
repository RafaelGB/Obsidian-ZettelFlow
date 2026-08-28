import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// test/starters → 2 ups → repo root
const STARTERS = join(__dirname, "..", "..", "src", "starters");

function collect(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collect(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

/**
 * Command-surface audit (#316 S6): every command id registered in `src/starters` (via `addCommand`
 * and the `SurfaceCommandsComponent` table) is **unique** and **kebab-case with no plugin prefix**.
 * This locks the public command surface so a duplicate or badly-named id can't slip in.
 */
describe("command id surface (#316 S6)", () => {
    const ids = collect(STARTERS)
        .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]));

    it("finds the command ids", () => {
        expect(ids.length).toBeGreaterThan(20); // sanity: the surface exists
        expect(ids).toContain("show-home");
        expect(ids).toContain("cultivate");
        expect(ids).toContain("quick-capture");
    });

    it("every id is kebab-case with no plugin prefix", () => {
        const bad = ids.filter((id) => !/^[a-z][a-z0-9-]*$/.test(id));
        expect(bad).toEqual([]);
    });

    it("has no duplicate command ids", () => {
        const seen = new Set<string>();
        const dupes = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
        expect(dupes).toEqual([]);
    });
});

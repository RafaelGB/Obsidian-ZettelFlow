import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// test/architecture/components/core → 4 ups → repo root
const CORE_ROOT = join(__dirname, "..", "..", "..", "..", "src", "architecture", "components", "core");

function collect(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collect(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

// The Experience layer may only reach the Knowledge Model through the top barrel or the State surface.
const ALLOWED = new Set(["architecture/knowledge", "architecture/knowledge/state"]);

describe("Experience views consume the Knowledge State surface, not deep analyses (#266, FR-3, AC-2/AC-3)", () => {
    const files = collect(CORE_ROOT);

    it("scans a non-empty set of view files", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it("no view deep-imports an individual knowledge analysis (only the barrel or the State facade)", () => {
        const offenders: string[] = [];
        for (const file of files) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/from\s+["'](architecture\/knowledge[^"']*)["']/g)) {
                const spec = m[1];
                if (!ALLOWED.has(spec)) offenders.push(`${file.replace(CORE_ROOT, "core")} → ${spec}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("no view owns a classifyHealth calculator (it lives in the State surface)", () => {
        for (const file of files) {
            const src = readFileSync(file, "utf8");
            expect(src).not.toMatch(/(export\s+)?function\s+classifyHealth\b/);
        }
    });
});

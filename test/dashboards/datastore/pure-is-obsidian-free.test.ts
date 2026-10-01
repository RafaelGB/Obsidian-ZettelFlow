import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// The pure dashboards core, reached from test/dashboards/datastore/
const PURE_ROOTS = [
    join(__dirname, "..", "..", "..", "src", "dashboards", "datastore"),
    join(__dirname, "..", "..", "..", "src", "dashboards", "transform"),
];

function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
        else if (entry.endsWith(".ts")) out.push(full);
    }
    return out;
}

describe("Base Dashboards pure core stays Obsidian-free (AC-6)", () => {
    const files = PURE_ROOTS.flatMap((root) => collectTsFiles(root));

    it("has files to guard", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it("no datastore file imports from 'obsidian'", () => {
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect({ file, obsidian: /from\s+["']obsidian["']/.test(source) })
                .toEqual({ file, obsidian: false });
        }
    });

    it("and none value-imports the plugin layer or the obsidian-facing base boundary", () => {
        // `import type` is erased, so it borrows a shape without borrowing a world — only *value*
        // imports drag Obsidian behind them (the knowledge purity guards reason the same way).
        const plugin = /^import\s+(?!type\b)[^;]*?from\s+["']architecture\/plugin/m;
        const base = /^import\s+(?!type\b)[^;]*?from\s+["']dashboards\/base/m;
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect({ file, plugin: plugin.test(source), base: base.test(source) })
                .toEqual({ file, plugin: false, base: false });
        }
    });
});

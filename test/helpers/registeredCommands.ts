import fs from "fs";
import path from "path";

/**
 * Every command id this plugin registers, read out of the source (#575, epic #574).
 *
 * Read rather than imported because registration happens inside `onLoad` on a live `Plugin`, and
 * standing up nineteen components against a fake app to count strings would test the fake. The ids
 * are literals at every call site — that is the contract this scan depends on, and the "every id is
 * a literal" assertion in `commandsStable.test.ts` is what keeps it true.
 */
const SRC = path.resolve(__dirname, "..", "..", "src");

/** `this.plugin.addCommand({ id: "x", … })` — the direct registrations. */
const DIRECT = /addCommand\(\{\s*id:\s*["']([^"']+)["']/g;

/** `{ id: "show-…", nameKey: … }` — the `SURFACE_COMMANDS` table, registered in a loop. */
const TABLE = /\{\s*id:\s*["']([^"']+)["'],\s*nameKey:/g;

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
}

/** The ids, sorted and de-duplicated. */
export function registeredCommands(): string[] {
    const ids = new Set<string>();
    for (const file of walk(SRC)) {
        const source = fs.readFileSync(file, "utf8");
        for (const pattern of [DIRECT, TABLE]) {
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(source)) !== null) ids.add(match[1]);
        }
    }
    return [...ids].sort();
}

/** How many `addCommand(` call sites exist at all — so a non-literal id cannot hide from the scan. */
export function addCommandCallSites(): number {
    return walk(SRC).reduce(
        (total, file) => total + (fs.readFileSync(file, "utf8").match(/addCommand\(/g) ?? []).length,
        0
    );
}

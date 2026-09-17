import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/** Files that actually build a function out of user code — the runners, not the type declarations. */
function runners(): { path: string; text: string }[] {
    return sources(SRC)
        .map((path) => ({ path, text: readFileSync(path, "utf8") }))
        .filter(({ path, text }) => {
            if (path.endsWith("FnConstructor.ts")) return false; // the home itself
            if (path.endsWith(join("api", "index.ts"))) return false; // a re-export
            return /buildAsyncScriptFunction\(|buildSyncScriptFunction\(/.test(text);
        });
}

/**
 * Every place that runs a script also writes it down (#444, AC-2).
 *
 * The list is derived from the code — the callers of the two function builders — rather than
 * copied into the test, so a sixth surface cannot be added without either recording its runs or
 * failing here. Five surfaces each handling their own failures is how a hook's error became a
 * toast nobody saw.
 */
describe("every script run leaves a fact (#444)", () => {
    it("finds the runners from the source, not from a list in the test", () => {
        expect(runners().length).toBeGreaterThanOrEqual(5);
    });

    it("has each of them record", () => {
        const silent = runners()
            .filter(({ text }) => !/withScriptRun\(|recordScriptRun\(/.test(text))
            .map(({ path }) => path.slice(SRC.length + 1));
        expect(silent).toEqual([]);
    });

    it("keeps the recorder itself out of the script's way", () => {
        // A recorder that throws must not turn a working script into a broken one.
        const recorder = readFileSync(
            join(SRC, "architecture", "api", "lib", "recordScriptRun.ts"),
            "utf8"
        );
        expect(recorder).toContain("catch");
        expect(recorder).toContain("log.warn");
    });
});

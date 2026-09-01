import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import {
    SCRIPT_ACTION_BINDINGS,
    DYNAMIC_SELECTOR_BINDINGS,
    HOOK_BINDINGS,
    CONDITION_BINDINGS,
    bindingNames,
    bindingArgs,
    type ScriptBinding,
} from "architecture/api/bindings/scriptBindings";

// test/architecture/api/bindings → 4 ups → repo root
const SRC = join(__dirname, "..", "..", "..", "..", "src");
const BINDINGS_MODULE = join("architecture", "api", "bindings", "scriptBindings.ts");

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const ALL_SURFACES: Record<string, readonly ScriptBinding[]> = {
    "script action": SCRIPT_ACTION_BINDINGS,
    "dynamic selector": DYNAMIC_SELECTOR_BINDINGS,
    "hook body": HOOK_BINDINGS,
    "condition": CONDITION_BINDINGS,
};

describe("the binding contract of a scripting surface (#349, FR-2/AC-3)", () => {
    it.each(Object.entries(ALL_SURFACES))("%s offers zf and app", (_name, bindings) => {
        expect(bindingNames(bindings)).toContain("zf");
        expect(bindingNames(bindings)).toContain("app");
    });

    it.each(Object.entries(ALL_SURFACES))("%s names every binding exactly once", (_name, bindings) => {
        const names = bindingNames(bindings);
        expect(new Set(names).size).toBe(names.length);
    });

    it.each(Object.entries(ALL_SURFACES))("%s describes every binding it offers", (_name, bindings) => {
        for (const binding of bindings) {
            expect(binding.type.trim()).not.toBe("");
        }
    });

    it("orders arguments to match the declared names, so the two cannot disagree", () => {
        const values = { element: 1, content: 2, note: 3, context: 4, zf: 5, app: 6 };
        const names = bindingNames(SCRIPT_ACTION_BINDINGS);

        expect(bindingArgs(SCRIPT_ACTION_BINDINGS, values)).toEqual(names.map((n) => values[n as keyof typeof values]));
    });

    it("yields undefined — not a crash — for a value the caller forgot", () => {
        expect(bindingArgs(DYNAMIC_SELECTOR_BINDINGS, {})).toEqual(bindingNames(DYNAMIC_SELECTOR_BINDINGS).map(() => undefined));
    });
});

describe("every execution site builds its signature from the contract (#349, AC-3)", () => {
    const files = sourceFiles(SRC);

    it("finds the source tree", () => {
        expect(files.length).toBeGreaterThan(100);
    });

    /**
     * A literal argument list at a call site is how `app` came to be advertised by the editor and the
     * settings reader while no site actually injected it. Forcing every site through the shared
     * constant makes that particular lie unrepresentable rather than merely fixed.
     */
    it("passes no literal argument array to buildAsyncScriptFunction", () => {
        const offenders = files
            .filter((file) => !file.endsWith(BINDINGS_MODULE))
            .filter((file) => /buildAsyncScriptFunction\(\s*\[/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual([]);
    });
});

describe("diagnostics reach the plugin log, never the bare console (#349, FR-4/AC-2)", () => {
    const files = sourceFiles(SRC);

    /**
     * A `console.error` is invisible in the plugin's own log — the one place a user looks when their
     * script misbehaves. Both offenders were on the scripting path, which is exactly where a swallowed
     * diagnostic costs the most. Same shape as the `AsyncFunction` guardrail: the console has one home.
     */
    it("reaches the console from the Logger only", () => {
        const offenders = files
            .filter((file) => /(^|[^.\w])console\.(log|error|warn|info|debug|trace)\(/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual(["architecture/monitoring/Logger.ts"]);
    });
});

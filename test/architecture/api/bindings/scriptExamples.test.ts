import { describe, it, expect } from "@jest/globals";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { ALL_SCRIPT_EXAMPLES, type ScriptExample } from "architecture/api/bindings/scriptExamples";
import {
    bindingNames,
    SCRIPT_ACTION_BINDINGS,
    DYNAMIC_SELECTOR_BINDINGS,
    HOOK_BINDINGS,
    CONDITION_BINDINGS,
} from "architecture/api/bindings/scriptBindings";
import { syntaxDiagnostics } from "architecture/components/core/codeView/editor/extensions/apiCompletion/syntaxLint";

/**
 * Every binding name any surface injects. The failure worth catching is an example reaching for a
 * binding a *different* surface has — a Dynamic Selector example using `note`, say, which would run
 * fine in the docs and throw in the editor. Ordinary locals and JS globals are not interesting here.
 */
const ALL_BINDING_NAMES = new Set([
    ...bindingNames(SCRIPT_ACTION_BINDINGS),
    ...bindingNames(DYNAMIC_SELECTOR_BINDINGS),
    ...bindingNames(HOOK_BINDINGS),
    ...bindingNames(CONDITION_BINDINGS),
]);

/** Root identifiers the snippet dereferences, e.g. the `zf` in `zf.knowledge.debt()`. */
function rootsUsed(code: string): string[] {
    const roots = new Set<string>();
    // Strip string literals so text inside them is never mistaken for code.
    const stripped = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    for (const match of stripped.matchAll(/(^|[^\w.$])([A-Za-z_$][\w$]*)\s*\./gm)) roots.add(match[2]);
    return [...roots];
}

function parseErrors(example: ScriptExample): number {
    // Wrapped exactly as every surface wraps a script, so a bare `return` is legal here too.
    const state = EditorState.create({
        doc: `(async () => {\n${example.code}\n})();`,
        extensions: [javascript()],
    });
    return syntaxDiagnostics(state).length;
}

describe("every shipped example is honest (#351, FR-5/AC-5)", () => {
    it("ships examples for the surfaces that had none", () => {
        expect(ALL_SCRIPT_EXAMPLES.length).toBeGreaterThan(5);
    });

    it.each(ALL_SCRIPT_EXAMPLES.map((example) => [example.labelKey, example] as const))(
        "%s parses",
        (_key, example) => {
            expect(parseErrors(example)).toBe(0);
        }
    );

    /**
     * A wrong example is worse than no example: the user assumes it works and debugs their own code.
     * This is the same failure the epic is about — a description of the API drifting from the API.
     */
    it.each(ALL_SCRIPT_EXAMPLES.map((example) => [example.labelKey, example] as const))(
        "%s references only bindings its surface injects",
        (_key, example) => {
            const mine = new Set(bindingNames(example.bindings));
            const foreign = rootsUsed(example.code).filter((root) => ALL_BINDING_NAMES.has(root) && !mine.has(root));

            expect(foreign).toEqual([]);
        }
    );

    it("labels every example in both locales", () => {
        const locales: [string, Record<string, string>][] = [
            ["en", en as unknown as Record<string, string>],
            ["es", es as unknown as Record<string, string>],
        ];

        for (const [name, locale] of locales) {
            for (const example of ALL_SCRIPT_EXAMPLES) {
                expect(`${name}:${example.labelKey}=${locale[example.labelKey] ?? ""}`).not.toMatch(/=$/);
            }
        }
    });

    it("keeps the code itself out of the locale files — code is code", () => {
        const locale = en as unknown as Record<string, string>;
        for (const example of ALL_SCRIPT_EXAMPLES) {
            expect(locale[example.labelKey]).not.toContain("zf.");
        }
    });
});

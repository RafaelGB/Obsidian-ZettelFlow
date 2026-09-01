import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const SCRIPTING_KEYS = [
    "script_action_error_notice",
    "script_debug_name",
    "script_debug_description",
    "script_debug_run",
    "script_debug_clear",
    "script_debug_error",
    "script_debug_output",
    "dynamic_selector_loading",
    "dynamic_selector_error",
    "dynamic_selector_invalid_result",
    "property_hooks_script_error_notice",
];

type Locale = Record<string, string>;
const locales: [string, Locale][] = [
    ["en", en as unknown as Locale],
    ["es", es as unknown as Locale],
];

// test/config → 2 ups → repo root
const SCRIPTING_DIRS = [
    join(__dirname, "..", "..", "src", "actions", "script"),
    join(__dirname, "..", "..", "src", "actions", "dynamicSelector"),
];

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

describe("the scripting UI speaks both languages (#349, FR-3/AC-4)", () => {
    it.each(locales)("%s defines every scripting key", (_name, locale) => {
        for (const key of SCRIPTING_KEYS) {
            expect(`${key}=${locale[key] ?? ""}`).not.toMatch(/=$/);
        }
    });

    it("keeps the two locales genuinely distinct, not copy-pasted English", () => {
        const shared = SCRIPTING_KEYS.filter(
            (key) => (en as unknown as Locale)[key] === (es as unknown as Locale)[key]
        );

        // `script_debug_error` is "Error: {0}" in both — the word is identical in Spanish.
        expect(shared).toEqual(["script_debug_error"]);
    });

    /**
     * Three user-visible Spanish strings shipped to every user from the dynamic selector, because the
     * scripting UI grew outside the i18n layer. This keeps the whole scripting surface inside it.
     */
    it("leaves no user-visible literal behind in the scripting actions", () => {
        const offenders: string[] = [];
        for (const dir of SCRIPTING_DIRS) {
            for (const file of sourceFiles(dir)) {
                const source = readFileSync(file, "utf8");
                for (const call of source.matchAll(/\.(setName|setDesc|setButtonText)\(\s*"/g)) {
                    offenders.push(`${file}: ${call[1]}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });
});

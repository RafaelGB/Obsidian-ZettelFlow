import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, sep } from "path";
import en from "architecture/lang/locale/en";

// test/config → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const LOCALE_DIR = join("architecture", "lang", "locale");

/**
 * The prefixes a key can be reached by without ever appearing as a literal, because the call site
 * composes it: `t(\`cultivate_move_${move.kind}_title\`)`. Anything under one of these is presumed
 * live. Keys stored in a data field (`labelKey: "surface_mode_home"`) still appear literally, so they
 * need no exemption.
 *
 * Adding a prefix here is how you *keep* a key; it should be a deliberate, rare act.
 */
const COMPOSED_PREFIXES = ["condition_op_", "cultivate_move_", "system_difficulty_", "confidence_", "judgement_verdict_", "ask_graph_lens_", "ask_graph_col_", "ask_graph_field_"];

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

/** Everything in `src/` except the locale files themselves. */
function productionSource(): string {
    return sourceFiles(SRC)
        .filter((file) => !file.includes(LOCALE_DIR.split("/").join(sep)))
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");
}

/**
 * Both forms the table uses: a bare identifier, and a quoted key — which is how the hyphenated ones
 * (`"home_recommendation_reason_re-engage"`, `"condition_op_not-equals"`) have to be written.
 */
function localeKeys(): string[] {
    const source = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");
    return [...source.matchAll(/^ {4}"?([a-zA-Z0-9_-]+)"?:/gm)].map((match) => match[1]);
}

/**
 * A translated string nothing renders is dead weight in **two** files, and it rots quietly: the next
 * person to read `en.ts` cannot tell which half of it is real. This is the `console`/`AsyncFunction`
 * guardrail shape applied to the i18n layer (#320).
 */
describe("every translated string is actually rendered (#320)", () => {
    const keys = localeKeys();
    const source = productionSource();

    it("reads the locale table", () => {
        expect(keys.length).toBeGreaterThan(1000);
        expect(Object.keys(en).length).toBe(keys.length);
    });

    it("leaves no key that no code reaches", () => {
        const orphans = keys.filter(
            (key) => !COMPOSED_PREFIXES.some((prefix) => key.startsWith(prefix)) && !source.includes(key)
        );

        expect(orphans).toEqual([]);
    });

    it("keeps the composed-prefix exemption honest — each one is really composed somewhere", () => {
        for (const prefix of COMPOSED_PREFIXES) {
            expect(`${prefix}: ${source.includes("t(`" + prefix)}`).toBe(`${prefix}: true`);
        }
    });
});

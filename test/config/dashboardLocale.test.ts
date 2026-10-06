import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * Home's strings (#620, rewritten for #703), in **both** locales and in **sentence case**.
 *
 * `localeParity` is the superset guard; this is the per-feature subset check the house rule asks
 * for — every new key present and non-empty in `en` and `es`, and written as a phrase (only the
 * first word capitalised) rather than Title Case or ALL CAPS (§IV).
 */
const KEYS = [
    "home_left_off",
    "home_came_back",
    "home_idea_to_tend",
    "home_idea_go",
    "home_first_ways",
    "home_section_pinned_queries",
] as const;

const read = (dict: unknown, key: string): string => String((dict as Record<string, string>)[key] ?? "");

describe("Home's strings exist in both locales, in sentence case (#620, #703)", () => {
    for (const key of KEYS) {
        it(`${key} is present and non-empty in en and es`, () => {
            expect(read(en, key).length).toBeGreaterThan(0);
            expect(read(es, key).length).toBeGreaterThan(0);
        });
    }

    it("reads as sentence case — only the first word is capitalised", () => {
        for (const key of KEYS) {
            for (const dict of [en, es]) {
                const rest = read(dict, key).split(/\s+/).slice(1);
                const titleCased = rest.filter((word) => /^[A-ZÁÉÍÓÚÑ]/.test(word));
                expect({ key, titleCased }).toEqual({ key, titleCased: [] });
            }
        }
    });
});

import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * The dashboard's new strings (#620), in **both** locales and in **sentence case**.
 *
 * `localeParity` is the superset guard; this is the per-feature subset check the house rule asks
 * for — every new key present and non-empty in `en` and `es`, and written as a phrase (only the
 * first word capitalised) rather than Title Case or ALL CAPS (§IV).
 */
const KEYS = [
    "home_show_everything",
    "home_hide_extras",
    "home_hero_next",
    "home_hero_cultivate",
    "home_hero_return",
    "home_ask_graph",
] as const;

const read = (dict: unknown, key: string): string => String((dict as Record<string, string>)[key] ?? "");

describe("the dashboard's new strings exist in both locales, in sentence case (#620)", () => {
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

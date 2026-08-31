import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { FRICTION_PROMPTS } from "architecture/knowledge/cultivate/cultivationSession";

const CHROME_KEYS = [
    "cultivate_friction_reveal",
    "cultivate_friction_skip",
    "cultivate_friction_placeholder",
    "settings_cultivate_friction_name",
    "settings_cultivate_friction_desc",
];

type Locale = Record<string, string>;
const locales: [string, Locale][] = [
    ["en", en as unknown as Locale],
    ["es", es as unknown as Locale],
];

describe("deliberate friction speaks both languages (#338, FR-9)", () => {
    it("every prompt key in the friction table resolves", () => {
        // A missing key would render an empty question — worse than no friction at all.
        for (const [name, locale] of locales) {
            for (const friction of Object.values(FRICTION_PROMPTS)) {
                expect(`${name}:${friction.promptKey}:${locale[friction.promptKey] ?? ""}`).not.toMatch(/::?$/);
            }
        }
    });

    it("the prompts are real questions, not a confirmation dialog", () => {
        for (const friction of Object.values(FRICTION_PROMPTS)) {
            expect((en as unknown as Locale)[friction.promptKey]).toMatch(/\?$/);
            expect((es as unknown as Locale)[friction.promptKey]).toMatch(/\?$/);
        }
    });

    it("the reveal/skip chrome and the toggle exist in both locales", () => {
        for (const [, locale] of locales) {
            for (const key of CHROME_KEYS) {
                expect(typeof locale[key]).toBe("string");
                expect(locale[key].length).toBeGreaterThan(0);
            }
        }
    });
});

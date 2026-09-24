import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * A date in the future must not become a deadline (#572, epic #560).
 *
 * The progression is the whole risk: a date invites a countdown, a countdown invites a colour, and
 * a colour invites a nudge — which is how a thinking tool becomes a task manager. This product
 * refused that once already, in #519, when a note became a step on a canvas and nowhere else.
 *
 * So the horizon says the same thing at every distance, before and after the day arrives, and this
 * is the scan that keeps it that way.
 */
const PREFIXES = ["evolution_timeline_horizon", "claim_return_wager", "home_claim_return_wager"];

const URGENT = [
    /\bdeadline\b/i,
    /\bfecha límite\b/i,
    /\boverdue\b/i,
    /\bvencid/i,
    /\bremaining\b/i,
    /\brestante/i,
    /\bdays left\b/i,
    /\bquedan\b/i,
    /\bhurry\b/i,
    /\bcorre\b/i,
    /\blate\b/i,
    /\btarde\b/i,
    /\burgent/i,
];

const stringsOf = (locale: Record<string, string>) =>
    Object.entries(locale).filter(([key]) => PREFIXES.some((prefix) => key.startsWith(prefix)));

describe("a horizon is a date, never a deadline (#572)", () => {
    it("covers the strings the wager added", () => {
        expect(stringsOf(en as Record<string, string>).length).toBeGreaterThan(5);
    });

    it("urges nothing, in either language", () => {
        for (const [name, locale] of [
            ["en", en],
            ["es", es],
        ] as const) {
            const offenders = stringsOf(locale as Record<string, string>)
                .filter(([, value]) => URGENT.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("counts no days", () => {
        for (const [key, value] of stringsOf(en as Record<string, string>)) {
            // A `{0}` is where the **date** goes, and a date is not a count. Everything else that
            // looks like a number in one of these strings is one.
            const spoken = value.replace(/\{\d+\}/g, "");
            expect({ key, digits: /\d/.test(spoken) }).toEqual({ key, digits: false });
        }
    });

    it("keeps both locales in step", () => {
        const keysOf = (locale: Record<string, string>) => stringsOf(locale).map(([key]) => key).sort();
        expect(keysOf(es as Record<string, string>)).toEqual(keysOf(en as Record<string, string>));
    });

    it("reports a planted countdown rather than trusting anyone to notice one", () => {
        const planted = { evolution_timeline_horizon_left: "3 days remaining — do not be late" };
        const offenders = Object.entries(planted)
            .filter(([, value]) => URGENT.some((pattern) => pattern.test(value)))
            .map(([key]) => key);
        expect(offenders).toEqual(["evolution_timeline_horizon_left"]);
    });
});

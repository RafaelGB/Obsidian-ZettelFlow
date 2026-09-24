import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * The loop says what happened, and never what it was worth (#564, epic #558).
 *
 * A claim that changed invites a conclusion — *you have gone deeper*, *this idea has grown*, *well
 * done* — and every one of those would be the system forming a judgement about the user, which §XII
 * says it does not get to do. Worse, it would turn a mirror into a scoreboard: the whole value of
 * seeing what you said in June is that nobody grades the difference.
 *
 * #494 shipped this scan for the move strings. This is the general version, over every string the
 * return loop added, because the sentence will arrive as a string in six months and a note in a
 * review will not stop it.
 */
const PREFIXES = [
    "evolution_timeline_return_",
    "claim_return_",
    "claim_door_",
    "home_claim_return_",
    "settings_return_",
];

const FORBIDDEN = [
    /\bprogress\b/i,
    /\bprogreso/i,
    /\bdeeper\b/i,
    /\bprofundi/i,
    /\bdensity\b/i,
    /\bdensidad\b/i,
    /\bgrowth\b/i,
    /\bcrecimiento\b/i,
    /\bimprove/i,
    /\bmejora/i,
    /\bbetter\b/i,
    /\bmejor\b/i,
    /\bwell done\b/i,
    /\bbien hecho\b/i,
    /\bgreat\b/i,
    /\bgenial\b/i,
];

describe("the return loop states, and never assesses (#564)", () => {
    it("covers the strings the loop actually added", () => {
        const covered = Object.keys(en).filter((key) => PREFIXES.some((prefix) => key.startsWith(prefix)));
        expect(covered.length).toBeGreaterThan(20);
    });

    it("says nothing about progress or praise, in either language", () => {
        for (const [name, locale] of [
            ["en", en],
            ["es", es],
        ] as const) {
            const offenders = Object.entries(locale as Record<string, string>)
                .filter(([key]) => PREFIXES.some((prefix) => key.startsWith(prefix)))
                .filter(([, value]) => FORBIDDEN.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("keeps both locales in step over those prefixes", () => {
        const keysOf = (locale: Record<string, string>) =>
            Object.keys(locale)
                .filter((key) => PREFIXES.some((prefix) => key.startsWith(prefix)))
                .sort();
        expect(keysOf(es as Record<string, string>)).toEqual(keysOf(en as Record<string, string>));
    });
});

import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { tCount } from "architecture/lang";

/**
 * The next-step card states facts (#641 FR-4, AC-5; D3, §XII). It says what a move rests on — "makes
 * two claims with no source" — and never how good the note is, how mature, or what you should do to
 * improve it. A scan keeps every card string honest in both languages.
 */
const ASSESSING = {
    en: /(score|grade|rating|healthy|unhealthy|mature|maturity|weak|strong|poor|good|better|best|should|must|improve|incomplete|%)/i,
    es: /(puntuaci|nota media|calificaci|sana|madur|d[eé]bil|fuerte|pobre|buena|mejor|deber[ií]a|debes|mejorar|incomplet|%)/i,
};

const cardKeys = (locale: Record<string, string>) => Object.entries(locale).filter(([key]) => key.startsWith("note_next_"));

describe("the next-step card says facts, never a verdict (#641)", () => {
    it("has its strings in both languages", () => {
        expect(cardKeys(en as Record<string, string>).map(([key]) => key).sort()).toEqual(
            cardKeys(es as Record<string, string>).map(([key]) => key).sort()
        );
        expect(cardKeys(en as Record<string, string>).length).toBeGreaterThan(20);
    });

    for (const [name, locale] of [["en", en], ["es", es]] as const) {
        it(`assesses nothing in ${name}`, () => {
            const offenders = cardKeys(locale as Record<string, string>).filter(([, value]) => ASSESSING[name].test(value));
            expect(offenders).toEqual([]);
        });
    }

    it("agrees in number", () => {
        expect(tCount(1, "note_next_why_source", "1")).toBe("Makes 1 claim with no source.");
        expect(tCount(2, "note_next_why_source", "2")).toBe("Makes 2 claims with no source.");
    });
});

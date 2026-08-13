import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// The label/desc/notice keys for the #184 AI fast-follow actions.
const KEYS = [
    "ai_challenge_idea_label",
    "ai_challenge_idea_desc",
    "ai_challenge_idea_notice",
    "ai_synthesize_label",
    "ai_synthesize_desc",
    "ai_synthesize_notice",
    "ai_suggest_connections_label",
    "ai_suggest_connections_desc",
    "ai_suggest_connections_notice",
];

describe("AI fast-follow i18n parity (#184)", () => {
    it("defines all 9 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(9);
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of KEYS) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});

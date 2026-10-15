import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * The words of installing a system (#214, AC-6), since #799 said in the Systems room's panel rather
 * than a modal: the location, the button, another copy, the code it brings, and every outcome.
 */
const KEYS = [
    "community_system_install_location",
    "community_install",
    "community_install_another",
    "community_installed_notice",
    "community_code_brings",
    "community_code_ack",
    "community_system_install_error",
];

describe("installing a system speaks both languages (#214, #799)", () => {
    it("defines every key in both en and es, non-empty", () => {
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of KEYS) {
            expect({ key, en: typeof enMap[key] }).toEqual({ key, en: "string" });
            expect(enMap[key].length).toBeGreaterThan(0);
            expect({ key, es: typeof esMap[key] }).toEqual({ key, es: "string" });
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});

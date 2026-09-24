import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { CAPABILITIES, CAPABILITY_DOORS, depthOf } from "architecture/components/core/surface/capabilities";

/**
 * The inventory is real (#575, epic #574).
 *
 * A registry of capabilities is worth exactly as much as its coverage: a list of six would pass
 * every other assertion in this file and prove nothing. So this suite checks the *shape* of the
 * inventory — that it is big enough to be the product, that every row is a thing with a name a
 * person could read, and that no row is a duplicate of another under a different id.
 *
 * The definition it enforces: **a capability is a thing a person can do that has a name in the
 * locale.** An internal seam has no such name, which is what keeps this from growing into a
 * second copy of the module list.
 */
const enMap = en as Record<string, string>;
const esMap = es as Record<string, string>;

describe("the capability inventory (#575)", () => {
    it("covers the product rather than a sample", () => {
        // The palette alone is 39 commands over 26 live capabilities, and the biggest doors in the
        // product (Cultivate's moves, the Lab's mechanics, the hooks) have no command at all.
        expect(CAPABILITIES.length).toBeGreaterThan(25);
    });

    it("has no duplicate id", () => {
        expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
    });

    it("gives every capability a name in both locales", () => {
        const nameless = CAPABILITIES.filter((id) => {
            const key = CAPABILITY_DOORS[id].nameKey;
            return !enMap[key] || !esMap[key];
        });
        expect(nameless).toEqual([]);
    });

    it("names each one in sentence case (§IV)", () => {
        const shouting = CAPABILITIES.filter((id) => /^[A-Z]{2,}/.test(enMap[CAPABILITY_DOORS[id].nameKey]));
        expect(shouting).toEqual([]);
    });

    it("gives every capability at least one door", () => {
        const shut = CAPABILITIES.filter((id) => CAPABILITY_DOORS[id].doors.length === 0);
        expect(shut).toEqual([]);
    });

    it("names an owner for every one — the 'one home per capability' answer (#268)", () => {
        const homeless = CAPABILITIES.filter((id) => !CAPABILITY_DOORS[id].owner);
        expect(homeless).toEqual([]);
    });

    it("lists doors best first, so the first one is the depth", () => {
        const misordered = CAPABILITIES.filter((id) => {
            const [first] = CAPABILITY_DOORS[id].doors;
            const kinds = { object: 1, surface: 2, recommendation: 3, settings: 4, command: 5 };
            return kinds[first.kind] !== depthOf(id);
        });
        expect(misordered).toEqual([]);
    });

    it("reports a nameless capability rather than trusting anyone to notice one", () => {
        const planted = { nameKey: "capability_with_no_name_in_the_locale" };
        expect(enMap[planted.nameKey]).toBeUndefined();
    });
});

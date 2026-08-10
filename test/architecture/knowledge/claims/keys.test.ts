import { describe, it, expect } from "@jest/globals";
import { isClaimKey, isSourceKey, isClaimOrSourceKey } from "architecture/knowledge/claims/keys";

describe("claim/source keys", () => {
    it("recognises claim keys", () => {
        expect(isClaimKey("claim")).toBe(true);
        expect(isClaimKey("claims")).toBe(false);
        expect(isClaimKey("source")).toBe(false);
    });

    it("recognises source keys", () => {
        expect(isSourceKey("source")).toBe(true);
        expect(isSourceKey("sources")).toBe(true);
        expect(isSourceKey("claim")).toBe(false);
    });

    it("recognises either", () => {
        expect(isClaimOrSourceKey("claim")).toBe(true);
        expect(isClaimOrSourceKey("sources")).toBe(true);
        expect(isClaimOrSourceKey("supports")).toBe(false);
    });
});

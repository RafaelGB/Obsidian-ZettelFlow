import { describe, it, expect } from "@jest/globals";
import {
    formatTimestamp,
    incrementAlphaSegment,
    incrementNumericSegment,
    isAlphaSegment,
    parseSegments,
    nextChildId,
    nextSiblingId,
    nextRootId,
} from "../../../src/actions/zettelId/zettelIdLogic";

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------
describe("formatTimestamp", () => {
    const fixedDate = new Date(2024, 2, 5, 9, 7, 3); // 2024-03-05 09:07:03

    it("formats a fixed date with default YYYYMMDDHHmm", () => {
        expect(formatTimestamp("YYYYMMDDHHmm", fixedDate)).toBe("202403050907");
    });

    it("formats with custom format including seconds", () => {
        expect(formatTimestamp("YYYY-MM-DD HH:mm:ss", fixedDate)).toBe("2024-03-05 09:07:03");
    });

    it("pads single-digit month, day, hour and minute with zeros", () => {
        const d = new Date(2024, 0, 1, 0, 0, 0); // 2024-01-01 00:00:00
        expect(formatTimestamp("YYYYMMDDHHmm", d)).toBe("202401010000");
    });

    it("uses current date when no Date is supplied", () => {
        // Just checks it returns a 12-digit string for the default format
        const result = formatTimestamp();
        expect(result).toMatch(/^\d{12}$/);
    });
});

// ---------------------------------------------------------------------------
// incrementAlphaSegment
// ---------------------------------------------------------------------------
describe("incrementAlphaSegment", () => {
    it("increments a → b", () => {
        expect(incrementAlphaSegment("a")).toBe("b");
    });

    it("increments y → z", () => {
        expect(incrementAlphaSegment("y")).toBe("z");
    });

    it("wraps z → aa", () => {
        expect(incrementAlphaSegment("z")).toBe("aa");
    });

    it("wraps az → ba", () => {
        expect(incrementAlphaSegment("az")).toBe("ba");
    });

    it("wraps zz → aaa", () => {
        expect(incrementAlphaSegment("zz")).toBe("aaa");
    });

    it("increments bz → ca", () => {
        expect(incrementAlphaSegment("bz")).toBe("ca");
    });
});

// ---------------------------------------------------------------------------
// incrementNumericSegment
// ---------------------------------------------------------------------------
describe("incrementNumericSegment", () => {
    it("increments 1 → 2", () => {
        expect(incrementNumericSegment("1")).toBe("2");
    });

    it("increments 21 → 22", () => {
        expect(incrementNumericSegment("21")).toBe("22");
    });

    it("increments 9 → 10", () => {
        expect(incrementNumericSegment("9")).toBe("10");
    });
});

// ---------------------------------------------------------------------------
// isAlphaSegment
// ---------------------------------------------------------------------------
describe("isAlphaSegment", () => {
    it("returns true for all-lowercase-alpha string", () => {
        expect(isAlphaSegment("abc")).toBe(true);
    });

    it("returns false for numeric string", () => {
        expect(isAlphaSegment("21")).toBe(false);
    });

    it("returns false for empty string", () => {
        expect(isAlphaSegment("")).toBe(false);
    });

    it("returns false for mixed alpha-numeric", () => {
        expect(isAlphaSegment("a1")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// parseSegments
// ---------------------------------------------------------------------------
describe("parseSegments", () => {
    it("parses a pure numeric ID", () => {
        expect(parseSegments("21")).toEqual(["21"]);
    });

    it("parses a numeric + alpha ID", () => {
        expect(parseSegments("21a")).toEqual(["21", "a"]);
    });

    it("parses 21a1b into four segments", () => {
        expect(parseSegments("21a1b")).toEqual(["21", "a", "1", "b"]);
    });

    it("returns empty array for empty string", () => {
        expect(parseSegments("")).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// nextChildId
// ---------------------------------------------------------------------------
describe("nextChildId", () => {
    it("appends 'a' to a numeric parent with no collisions", () => {
        expect(nextChildId("21", new Set())).toBe("21a");
    });

    it("appends '1' to an alpha parent (21a)", () => {
        expect(nextChildId("21a", new Set())).toBe("21a1");
    });

    it("advances past taken children (numeric parent)", () => {
        const taken = new Set(["21a", "21b"]);
        expect(nextChildId("21", taken)).toBe("21c");
    });

    it("advances past taken children (alpha parent)", () => {
        const taken = new Set(["21a1", "21a2", "21a3"]);
        expect(nextChildId("21a", taken)).toBe("21a4");
    });

    it("handles deep nesting", () => {
        expect(nextChildId("21a1b", new Set())).toBe("21a1b1");
    });

    it("rolls over alpha segment when all short candidates are taken", () => {
        // 21a through 21z all taken → next should be 21aa
        const taken = new Set<string>();
        for (let c = 97; c <= 122; c++) { // 'a' to 'z'
            taken.add("21" + String.fromCharCode(c));
        }
        expect(nextChildId("21", taken)).toBe("21aa");
    });
});

// ---------------------------------------------------------------------------
// nextSiblingId
// ---------------------------------------------------------------------------
describe("nextSiblingId", () => {
    it("increments last numeric segment: 21 → 22", () => {
        expect(nextSiblingId("21", new Set())).toBe("22");
    });

    it("increments last alpha segment: 21a → 21b", () => {
        expect(nextSiblingId("21a", new Set())).toBe("21b");
    });

    it("increments last numeric segment in deep id: 21a1 → 21a2", () => {
        expect(nextSiblingId("21a1", new Set())).toBe("21a2");
    });

    it("advances past taken siblings (alpha)", () => {
        const taken = new Set(["21b", "21c"]);
        expect(nextSiblingId("21a", taken)).toBe("21d");
    });

    it("advances past taken siblings (numeric)", () => {
        const taken = new Set(["22", "23"]);
        expect(nextSiblingId("21", taken)).toBe("24");
    });

    it("returns 21z for sibling of 21y when 21z is free", () => {
        expect(nextSiblingId("21y", new Set())).toBe("21z");
    });

    it("skips 21z when taken and returns 21aa for sibling of 21y", () => {
        const taken = new Set(["21z"]);
        expect(nextSiblingId("21y", taken)).toBe("21aa");
    });

    it("wraps alpha segment past z: sibling of 21z → 21aa", () => {
        expect(nextSiblingId("21z", new Set())).toBe("21aa");
    });
});

// ---------------------------------------------------------------------------
// nextRootId
// ---------------------------------------------------------------------------
describe("nextRootId", () => {
    it("returns '1' when no existing IDs", () => {
        expect(nextRootId(new Set())).toBe("1");
    });

    it("returns '2' when '1' exists", () => {
        expect(nextRootId(new Set(["1"]))).toBe("2");
    });

    it("advances past taken root IDs", () => {
        expect(nextRootId(new Set(["1", "2", "3"]))).toBe("4");
    });

    it("skips non-contiguous gap: returns '2' if only '1' and '3' exist", () => {
        expect(nextRootId(new Set(["1", "3"]))).toBe("2");
    });
});

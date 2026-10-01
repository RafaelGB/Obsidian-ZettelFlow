import { describe, it, expect } from "@jest/globals";
import { tCount } from "architecture/lang";

describe("field-inspector row count (AC-4 — tCount pair)", () => {
    it("uses the plural form for 0 and N", () => {
        expect(tCount(0, "dashboard_inspector_row_count", "0")).toBe("0 rows");
        expect(tCount(5, "dashboard_inspector_row_count", "5")).toBe("5 rows");
    });

    it("uses the singular form for 1", () => {
        expect(tCount(1, "dashboard_inspector_row_count", "1")).toBe("1 row");
    });
});

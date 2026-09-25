import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { capabilityAuditTable, AUDIT_MARK } from "architecture/components/core/surface/capabilityAudit";
import { CAPABILITIES } from "architecture/components/core/surface/capabilities";

/**
 * The checked-in audit matches the registry (#575, epic #574).
 *
 * The page is generated and committed for the same reason `docs/api/reference.md` is: a table
 * somebody maintains by hand is a table that is wrong by the second release, and this epic exists
 * precisely because nobody noticed a capability going quiet. Comparing the committed block against
 * the generator means a door can move — but not silently.
 */
/**
 * Read with line endings normalised. The generator joins with a bare newline; git hands a Windows
 * checkout the same file with a carriage return in front of every one — so a raw comparison passes
 * on CI and fails on half the machines that would run it, which is the worst kind of guardrail.
 */
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), "g");
const LF = String.fromCharCode(10);
const PAGE = readFileSync(join(__dirname, "..", "..", "docs", "development", "capability-doors.md"), "utf8").replace(
    CRLF,
    LF
);

describe("docs/development/capability-doors.md (#575)", () => {
    it("carries the generated block, unedited", () => {
        expect(PAGE).toContain(capabilityAuditTable());
    });

    it("wraps it in the marker, exactly twice", () => {
        expect(PAGE.split(AUDIT_MARK).length - 1).toBe(2);
    });

    it("states the rule the guardrails enforce, in words", () => {
        // A page of table and no rule is a page nobody learns anything from.
        expect(PAGE).toContain("at least one door of rank 1–3");
    });

    it("lists every capability, so no row can be quietly dropped from the page", () => {
        const missing = CAPABILITIES.filter((id) => !PAGE.includes(`\`${id}\``));
        expect(missing).toEqual([]);
    });
});

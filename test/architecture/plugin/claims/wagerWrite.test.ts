import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { wireHarness } from "../../../support/harness";
import { stateClaim, statedWager } from "architecture/plugin/claims/statedClaim";
import { JudgementLog, type JudgementHost } from "architecture/plugin/judgement/JudgementLog";
import type { Judgement } from "architecture/knowledge/judgement";

// test/architecture/plugin/claims → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
/** Comments say what the code must not say; a rule about the interface is judged on the code. */
function code(source: string): string {
    return source
        .split(String.fromCharCode(10))
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(String.fromCharCode(10));
}

const MODAL = code(
    readFileSync(join(ROOT, "src/architecture/components/core/claims/ClaimDoorModal.ts"), "utf8")
);

const NOTE = "Notes/microservices.md";
const BODY = "# Microservices\n\nOne service per team, so a deploy means something.\n";

function host(): JudgementHost {
    return {
        settings: { judgements: { enabled: true, log: [] as Judgement[] } } as JudgementHost["settings"],
        saveSettings: () => undefined,
    };
}

function arrange(frontmatter: Record<string, unknown> = {}) {
    const harness = wireHarness({ files: { [NOTE]: { body: BODY, frontmatter } } });
    JudgementLog.getInstance().init(host());
    return harness;
}

beforeEach(() => jest.useFakeTimers());

/**
 * One note, one write, one thing to undo (#570).
 *
 * The sentence, where it came from and what you expect to see are one thing you said — so they go
 * into the same `update()`, inside the batch that was already open, and come back as one undo.
 */
describe("the claim and its wager are one write (#570)", () => {
    it("writes both halves beside the claim, and leaves the body alone", async () => {
        const harness = arrange();
        const before = harness.vault.contentOf(NOTE);
        expect(
            await stateClaim(NOTE, "microservices move complexity", undefined, {
                expectation: "two teams stop waiting on each other",
                by: "2026-12-01",
            })
        ).toBe(true);

        expect(harness.vault.frontmatterOf(NOTE)).toEqual({
            claim: "microservices move complexity",
            expect: "two teams stop waiting on each other",
            by: "2026-12-01",
        });
        // The body is untouched — a claim and a wager are properties, and the harness renders a
        // property write into the frontmatter map rather than the content, which is the honest
        // place to assert it.
        expect(harness.vault.contentOf(NOTE)).toBe(before);
    });

    it("writes no wager key when none was given", async () => {
        const harness = arrange();
        await stateClaim(NOTE, "microservices move complexity");
        expect(harness.vault.frontmatterOf(NOTE)).toEqual({ claim: "microservices move complexity" });
    });

    it("writes no wager key for an incomplete pair, and keeps the claim", async () => {
        const harness = arrange();
        await stateClaim(NOTE, "a claim", undefined, { expectation: "something", by: "soon" });
        expect(harness.vault.frontmatterOf(NOTE)).toEqual({ claim: "a claim" });
    });

    it("reads back what it wrote", async () => {
        const harness = arrange();
        await stateClaim(NOTE, "a claim", undefined, { expectation: "e", by: "2026-12-01" });
        const file = harness.vault.entries.get(NOTE)?.file;
        expect(statedWager(file as never)).toEqual({
            expectation: "e",
            at: new Date(2026, 11, 1).getTime(),
        });
    });

    it("keeps the claim's own source out of it", async () => {
        const harness = arrange();
        await stateClaim(NOTE, "a claim", "[[The book]]", { expectation: "e", by: "2026-12-01" });
        expect(harness.vault.frontmatterOf(NOTE)).toEqual({
            claim: "a claim",
            source: "[[The book]]",
            expect: "e",
            by: "2026-12-01",
        });
    });

    it("writes nothing at all when the sentence is blank", async () => {
        const harness = arrange();
        const before = harness.vault.contentOf(NOTE);
        expect(await stateClaim(NOTE, "   ", undefined, { expectation: "e", by: "2026-12-01" })).toBe(false);
        expect(harness.vault.contentOf(NOTE)).toBe(before);
    });
});

/**
 * The optional lines, and they are optional (#570 FR-2).
 *
 * Most claims are not wagers. A form that insists on a date is a form nobody uses twice — the Lab's
 * rule, and #497's reason for never asking *why*.
 */
describe("the door asks, and never insists (#570)", () => {
    it("adds two plain inputs, one of them a date", () => {
        expect(MODAL).toContain('createEl("input", { type: "text", cls: c("claim-door-expect") })');
        expect(MODAL).toContain('createEl("input", { type: "date", cls: c("claim-door-by") })');
        expect(MODAL).not.toContain("innerHTML");
        expect(MODAL).not.toContain("el.style.");
    });

    it("submits from every box, through the loop that was already there", () => {
        expect(MODAL).toContain("for (const box of [input, source, expectation, by])");
    });

    it("prefills from the note, and marks nothing as missing", () => {
        expect(MODAL).toContain("statedWager(this.file)");
        expect(MODAL).not.toMatch(/required|missing|incomplete/i);
    });
});

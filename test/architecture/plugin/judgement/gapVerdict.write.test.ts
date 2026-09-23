import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { wireHarness } from "../../../support/harness";
import { JudgementLog, type JudgementHost } from "architecture/plugin/judgement/JudgementLog";
import { GAP_SUBJECT_PREFIX } from "architecture/knowledge/judgement/gapVerdict";
import type { Judgement } from "architecture/knowledge/judgement";

/**
 * **Rule a gap out without touching a note** (#534, AC-4, AC-5).
 *
 * This is the §XII check, run against the write-path harness rather than argued in a comment: the
 * one thing a verdict may change is the plugin's own record. Both notes come out byte-identical,
 * their frontmatter deep-equal, and the entry that lands carries four descriptors and a timestamp —
 * no sentence, no title, no fragment of either body.
 */
const NOW = Date.UTC(2026, 8, 23, 9, 0, 0);
const A = "ideas/atomicity.md";
const B = "ideas/zettelkasten.md";

const BODY_A = "# Atomicity\n\nOne idea per note, so a link means something.\n";
const BODY_B = "# Zettelkasten\n\nA slipbox is a conversation partner, not a filing cabinet.\n";

function host(enabled = true): JudgementHost & { saved: number } {
    return {
        saved: 0,
        settings: {
            judgements: { enabled, log: [] as Judgement[] },
        } as JudgementHost["settings"],
        saveSettings() {
            (this as unknown as { saved: number }).saved++;
        },
    };
}

function arrange(enabled = true) {
    const harness = wireHarness({
        files: {
            [A]: { body: BODY_A, frontmatter: { zettelFlowSettings: { state: "permanent" } } },
            [B]: { body: BODY_B, frontmatter: { zettelFlowSettings: { state: "permanent" } } },
        },
    });
    const wired = host(enabled);
    JudgementLog.getInstance().init(wired);
    return { harness, wired };
}

describe("rule a gap out without touching a note (#534, FR-1, FR-4, FR-6)", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    it("leaves both notes byte-identical, frontmatter included (AC-4)", () => {
        const { harness, wired } = arrange();
        const before = { a: harness.vault.contentOf(A), b: harness.vault.contentOf(B) };
        JudgementLog.getInstance().recordGapVerdict(A, B, NOW);

        // The bytes as the harness rendered them, captured before the verdict: byte-identical means
        // identical to what was there, not to the body alone.
        expect(harness.vault.contentOf(A)).toBe(before.a);
        expect(harness.vault.contentOf(B)).toBe(before.b);
        expect(harness.vault.frontmatterOf(A)).toEqual({ zettelFlowSettings: { state: "permanent" } });
        expect(harness.vault.frontmatterOf(B)).toEqual({ zettelFlowSettings: { state: "permanent" } });
        expect(wired.settings.judgements.log).toHaveLength(1);
    });

    it("records four descriptors and a time, and no word of either note (AC-5)", () => {
        const { wired } = arrange();
        JudgementLog.getInstance().recordGapVerdict(A, B, NOW);

        const [entry] = wired.settings.judgements.log;
        expect(Object.keys(entry).sort()).toEqual(["at", "origin", "path", "subject", "verdict"]);
        expect(entry).toEqual({
            at: NOW,
            path: A,
            subject: `${GAP_SUBJECT_PREFIX}${B}`,
            origin: "derived",
            verdict: "rejected",
        });

        const serialised = JSON.stringify(entry);
        for (const word of ["conversation", "filing cabinet", "One idea per note", "slipbox"]) {
            expect(serialised).not.toContain(word);
        }
    });

    it("records once however many times you click it (AC-3)", () => {
        // The case `recordJudgement` cannot handle: its repeat guard compares `at`, so the same
        // verdict seconds apart is not an exact repeat of the last entry — and an unrelated verdict
        // landing in between means it is not even the last one. Idempotence comes from the pair
        // already being ruled out.
        const { wired } = arrange();
        const log = JudgementLog.getInstance();

        log.recordGapVerdict(A, B, NOW);
        log.record({ path: A, subject: "challenge-idea", origin: "ai", verdict: "accepted" }, NOW + 1_000);
        log.recordGapVerdict(A, B, NOW + 5_000);
        log.recordGapVerdict(B, A, NOW + 9_000); // and the other way round

        const gaps = wired.settings.judgements.log.filter((entry) =>
            entry.subject.startsWith(GAP_SUBJECT_PREFIX)
        );
        expect(gaps).toHaveLength(1);
        expect(gaps[0].at).toBe(NOW);
    });

    it("does nothing, and throws nothing, when the record is off (AC-7)", () => {
        const { harness, wired } = arrange(false);
        const before = harness.vault.contentOf(A);
        expect(() => JudgementLog.getInstance().recordGapVerdict(A, B, NOW)).not.toThrow();
        expect(wired.settings.judgements.log).toEqual([]);
        expect(harness.vault.contentOf(A)).toBe(before);
    });

    it("stays inside the record's existing cap", () => {
        const { wired } = arrange();
        const log = JudgementLog.getInstance();
        // 500 unrelated verdicts, then one gap: the oldest is dropped, the cap holds, and the gap
        // is the newest entry.
        for (let n = 0; n < 500; n++) {
            log.record({ path: `notes/${n}.md`, subject: "connect", origin: "derived", verdict: "accepted" }, NOW + n);
        }
        expect(wired.settings.judgements.log).toHaveLength(500);

        log.recordGapVerdict(A, B, NOW + 1_000_000);
        expect(wired.settings.judgements.log).toHaveLength(500);
        expect(wired.settings.judgements.log[499].subject).toBe(`${GAP_SUBJECT_PREFIX}${B}`);
    });

    it("refuses a pair that is not two different notes", () => {
        const { wired } = arrange();
        JudgementLog.getInstance().recordGapVerdict(A, A, NOW);
        JudgementLog.getInstance().recordGapVerdict("", B, NOW);
        expect(wired.settings.judgements.log).toEqual([]);
    });
});

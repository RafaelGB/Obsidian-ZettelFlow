import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");

/** Every file the return loop added or took over (#558). */
const SOURCES = [
    "src/application/claims/claimEdit.ts",
    "src/application/claims/sourceEdit.ts",
    "src/application/claims/claimReturn.ts",
    "src/application/claims/returnDraft.ts",
    "src/application/claims/index.ts",
    "src/architecture/plugin/claims/statedClaim.ts",
    "src/architecture/plugin/claims/answerReturn.ts",
    "src/architecture/plugin/claims/lastReviewedOf.ts",
    "src/architecture/knowledge/review/dueClaims.ts",
    "src/architecture/plugin/events/reviewDue.ts",
    "src/architecture/components/core/claims/ClaimDoorModal.ts",
    "src/architecture/components/core/claims/SourceNoteSuggest.ts",
    "src/architecture/components/core/claims/ClaimReturnModal.ts",
    "src/starters/zcomponents/ClaimDoorComponent.ts",
    "src/starters/zcomponents/ClaimReturnComponent.ts",
    "src/config/modals/handlers/returnSettingsGroup.ts",
];

/** The prefixes the loop's strings live under, in both locales. */
const PREFIXES = [
    "claim_door_",
    "claim_return_",
    "home_claim_return_",
    "home_return_",
    "settings_return_",
    "evolution_timeline_return_",
];

/**
 * The one key under those prefixes that is *allowed* to sound like a deadline, and why: it is the
 * label of a **workflow event** in the trigger dropdown (#563), naming the token a flow binds to —
 * not something the interface says to you about your own claims.
 */
const EXEMPT = new Set(["event_review_due_label"]);

/**
 * A comment states nothing to a user, so a rule about what the product says should not read one.
 * (The fourth time this trap has been sprung in this repo — `moveOnANote`, `homeReturn`, `noDebt`.)
 */
function code(source: string): string {
    return source
        .split(String.fromCharCode(10))
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(String.fromCharCode(10));
}

function sources(): { name: string; source: string }[] {
    return SOURCES.map((name) => ({ name, source: code(readFileSync(join(ROOT, name), "utf8")) }));
}

function stringsUnderPrefixes(locale: Record<string, string>): [string, string][] {
    return Object.entries(locale).filter(
        ([key]) => PREFIXES.some((prefix) => key.startsWith(prefix)) && !EXEMPT.has(key)
    );
}

const DEBT_VOCABULARY = [
    /\bstreak\b/i,
    /\bracha\b/i,
    /\bconsecutive\b/i,
    /\bconsecutiv/i,
    /\boverdue\b/i,
    /\bvencid/i,
    /\bpending\b/i,
    /\bpendiente/i,
    /\bbehind\b/i,
    /\batrasad/i,
    /\bmissed\b/i,
    /\bwell done\b/i,
    /\bbien hecho\b/i,
];

const COUNTING_CODE = [/\bdueCount\b/, /\breturnsDue\b/, /\bclaimsDue\b/, /\bstreak\b/i, /\boverdue\b/i, /\bmissed\b/i];

/**
 * Nothing overdue, nothing counted (#565, epic #558).
 *
 * This is the most likely place in the product for a helpful sentence to arrive in six months. A
 * count of what is waiting, a streak of days you kept it up, a red date when you did not, a word of
 * praise when you did — each would arrive as a kindness, and each would replace the thing it was
 * measuring. The Lab's `noDebt` guardrail exists because a note in a review does not stop that;
 * this is the same wall around the return.
 *
 * The distinction a reviewer can check on a diff: **delight is in the moment, never in the
 * accumulation.** Two sentences meeting is the product. A number that goes up is the thing the
 * product exists instead of.
 */
describe("the return counts nothing (#565)", () => {
    it("scans the files it says it scans", () => {
        expect(sources()).toHaveLength(SOURCES.length);
        for (const { name, source } of sources()) expect({ name, empty: source.length === 0 }).toEqual({ name, empty: false });
    });

    it("keeps no tally in its code", () => {
        for (const { name, source } of sources()) {
            const offenders = COUNTING_CODE.filter((pattern) => pattern.test(source)).map(String);
            expect({ name, offenders }).toEqual({ name, offenders: [] });
        }
    });

    it("puts no number in front of you", () => {
        // `tCount` exists because "1 gaps" was wrong for a year (#546 D2). This feature has no
        // plural to get right, because it never says how many of anything there are.
        for (const { name, source } of sources()) {
            expect({ name, tCount: source.includes("tCount(") }).toEqual({ name, tCount: false });
            expect({ name, interpolated: /\bt\([^)]*\.length/.test(source) }).toEqual({ name, interpolated: false });
            expect({ name, stringified: /\bt\([^)]*String\(/.test(source) }).toEqual({ name, stringified: false });
        }
    });

    it("says nothing about debt, streaks or praise, in either locale", () => {
        for (const [name, locale] of [
            ["en", en],
            ["es", es],
        ] as const) {
            const offenders = stringsUnderPrefixes(locale as Record<string, string>)
                .filter(([, value]) => DEBT_VOCABULARY.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("never interrupts: no badge, no status bar, no ribbon of its own", () => {
        for (const { name, source } of sources()) {
            for (const forbidden of ["addStatusBarItem", "addRibbonIcon", "setBadge"]) {
                expect({ name, forbidden, found: source.includes(forbidden) }).toEqual({
                    name,
                    forbidden,
                    found: false,
                });
            }
        }
    });

    it("never reminds you", () => {
        for (const { name, source } of sources()) {
            for (const forbidden of ["setInterval", "registerInterval", "Notification"]) {
                expect({ name, forbidden, found: source.includes(forbidden) }).toEqual({
                    name,
                    forbidden,
                    found: false,
                });
            }
        }
    });

    it("acknowledges an act, and nothing else", () => {
        // A `Notice` is for something you just did. Two acknowledgement points across the loop:
        // the claim is on the note, and the sentence went to the thinking space.
        const notices = sources()
            .filter(({ source }) => source.includes("new Notice("))
            .map(({ name }) => name);
        expect(notices.sort()).toEqual([
            "src/architecture/components/core/claims/ClaimDoorModal.ts",
            "src/architecture/components/core/claims/ClaimReturnModal.ts",
        ]);
    });

    it("reports a planted count rather than trusting anyone to notice one", () => {
        // AC-1 asks for the scan to be proved by adding a counting string. Kept here permanently
        // instead of in a reviewer's memory.
        const planted = { home_return_due_count: "3 claims are waiting, and you are behind" };
        const offenders = stringsUnderPrefixes(planted)
            .filter(([, value]) => DEBT_VOCABULARY.some((pattern) => pattern.test(value)))
            .map(([key]) => key);
        expect(offenders).toEqual(["home_return_due_count"]);
    });
});

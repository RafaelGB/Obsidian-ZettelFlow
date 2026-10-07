import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * **Not related, one click, nothing written** (#534, epic #529).
 *
 * Two things are checked here, and both are checked the honest way. The **strings** are read
 * directly, because one name for one thing is a fact about the locale files. The **row** is
 * source-scanned, because `jest.config.js` runs `testEnvironment: "node"` with no jsdom, so this
 * view cannot be mounted at all — every renderer rule in the repo is scanned the same way, and what
 * a scan cannot reach is a manual step in the issue (§XIV) rather than a test that pretends.
 *
 * **Where it lives (#703).** The gaps section left Home with the dashboard; its verdict moved to the
 * one place a suggested connection is already in front of you — Cultivate's *Connect it* move, beside
 * *Link*. Same recorder, same words, same rule: nothing is written to the vault.
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const RENDERER = readFileSync(
    join(ROOT, "src/architecture/components/core/cultivate/CultivateModeRenderer.ts"),
    "utf8"
);
const SRC_HAS = (needle: string): boolean => RENDERER.includes(needle);

type Locale = Record<string, string>;
const locales: [string, Locale][] = [
    ["en", en as Locale],
    ["es", es as Locale],
];

describe("one name for one thing (#534, FR-7, AC-9)", () => {
    it("has no string anywhere that calls a gap a suggested connection", () => {
        for (const [name, locale] of locales) {
            const offenders = Object.entries(locale)
                .filter(([, value]) => /suggested connection|conexi(ón|ones) sugerida/i.test(value))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("has the gap keys, in both locales, non-empty", () => {
        for (const [name, locale] of locales) {
            for (const key of ["home_gap_not_related", "home_gap_not_related_aria"]) {
                expect({ locale: name, key, text: (locale[key] ?? "").length > 0 }).toEqual({
                    locale: name,
                    key,
                    text: true,
                });
            }
        }
    });

    it("has dropped the old key from the code entirely", () => {
        // A renamed key left behind is how a surface keeps two names for one thing.
        expect(SRC_HAS("home_section_suggested_connections")).toBe(false);
        for (const [, locale] of locales) expect("home_section_suggested_connections" in locale).toBe(false);
    });
});

describe("the row states, and never advises (#534, FR-7, AC-10)", () => {
    /** Second-person imperatives and advice verbs, from `exploreSaysFacts.test.ts`. */
    const ADVICE = [
        /\btry\b/i,
        /\byou should\b/i,
        /\bconsider\b/i,
        /\bwhy not\b/i,
        /\bintenta\b/i,
        /\bprueba\b/i,
        /\bdeberías\b/i,
        /\bte recomendamos\b/i,
    ];
    /** Reproach patterns, from `whatToDoNext.test.ts`. */
    const REPROACH = [/\bstill\b/i, /\boverdue\b/i, /\byou have\b/i, /\btodavía\b/i, /\bllevas\b/i, /\bpendiente desde\b/i];

    const gapStrings = (locale: Locale): [string, string][] =>
        Object.entries(locale).filter(
            ([key]) =>
                key.startsWith("home_gap_")
        );

    it("never tells you to link anything, in either locale", () => {
        for (const [name, locale] of locales) {
            const offenders = gapStrings(locale)
                .filter(([, value]) => ADVICE.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("never scores you for how many there are", () => {
        for (const [name, locale] of locales) {
            const offenders = gapStrings(locale)
                .filter(([, value]) => REPROACH.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });
});

describe("the action is absent when the record is off (#534, FR-6, AC-7)", () => {
    it("gates the button on the record being enabled", () => {
        // Never present-but-inert: `record` is a documented no-op with the log off, and a button
        // that silently does nothing is worse than a button that is not there.
        expect(SRC_HAS("const canRule = log.enabled();")).toBe(true);
        expect(SRC_HAS("if (!canRule) continue;")).toBe(true);
    });

    it("records through the one recorder, and re-reads after the click", () => {
        expect(SRC_HAS("JudgementLog.getInstance().recordGapVerdict(target, candidate);")).toBe(true);
        expect(SRC_HAS("this.recompute();")).toBe(true);
    });

    it("writes nothing to the vault from the verdict", () => {
        // The §XII line: the verdict is a judgement, and Cultivate's writes all go through the one
        // CultivationService — never a direct vault call from the renderer.
        for (const write of ["FileService", "FrontmatterService", "vault.create", "vault.modify"]) {
            expect(SRC_HAS(write)).toBe(false);
        }
    });

    it("offers no pair you already ruled out", () => {
        expect(SRC_HAS("const ruled = ruledOutGaps(log.entries());")).toBe(true);
        expect(SRC_HAS("!ruled.has(target, candidate)")).toBe(true);
    });

    it("builds the action as a real button carrying its own label", () => {
        expect(RENDERER).toMatch(/createEl\("button", \{\s*\n\s*text: t\("home_gap_not_related"\)/);
        expect(SRC_HAS('"aria-label": t("home_gap_not_related_aria")')).toBe(true);
    });
});

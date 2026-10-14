import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import es from "architecture/lang/locale/es";
import { CAPABILITIES } from "architecture/components/core/surface/capabilities";
import {
    compareVersions,
    docUrl,
    isSafeDoc,
    isSafeImage,
    pick,
    validateLearnCatalog,
    type LearnProblem,
} from "application/community/learn/learnCatalog";
import { isKnownGroup, settingsPaths } from "../support/settingsPaths";

// test/docs → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const CATALOG = join(ROOT, "docs", "learn", "catalog.json");
const FIXTURES = join(__dirname, "fixtures", "learn");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as { version: string };

const ctx = {
    exists: (path: string) => existsSync(join(ROOT, path)),
    capabilities: CAPABILITIES,
    pluginVersion: MANIFEST.version,
};

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
const shown = (problems: LearnProblem[]) => problems.map((p) => `${p.path}: ${p.problem}`);

/** Every string of one language in the catalog, with where it is. */
function strings(value: unknown, lang: "en" | "es", path = ""): [string, string][] {
    if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, lang, `${path}[${i}]`));
    if (typeof value !== "object" || value === null) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.en === "string" && typeof record.es === "string") return [[path, record[lang] as string]];
    return Object.entries(record).flatMap(([key, item]) => strings(item, lang, path ? `${path}.${key}` : key));
}

describe("the Learn catalog's safe paths and helpers (#801 FR-10, FR-13)", () => {
    it("takes a relative docs page, and nothing that leaves the docs", () => {
        expect(isSafeDoc("architecture/reversibility.md")).toBe(true);
        expect(isSafeDoc("actions/Prompt.md")).toBe(true);
        for (const bad of ["https://evil.md", "../secret.md", "/etc/x.md", "a//b.md", "page", "javascript:alert(1).md", 3]) expect(isSafeDoc(bad)).toBe(false);
    });

    it("takes an image under docs/resources/, and nothing else", () => {
        expect(isSafeImage("docs/resources/undo/undo.svg")).toBe(true);
        expect(isSafeImage("docs/resources/readme/install.png")).toBe(true);
        for (const bad of ["../x.svg", "https://x/y.svg", "docs/resources/../../x.svg", "docs/systems/gtd.svg", "docs/resources/x.js", "docs/resources/a b.svg"]) {
            expect(isSafeImage(bad)).toBe(false);
        }
    });

    it("builds the docs site URL of a page, and no other", () => {
        expect(docUrl("architecture/reversibility.md")).toBe("https://rafaelgb.github.io/Obsidian-ZettelFlow/architecture/reversibility/");
        expect(docUrl("index.md")).toBe("https://rafaelgb.github.io/Obsidian-ZettelFlow/");
        expect(docUrl("https://evil")).toBeNull();
    });

    it("compares versions number by number", () => {
        expect(compareVersions("3.7.0", "3.7.0")).toBe(0);
        expect(compareVersions("3.10.0", "3.9.9")).toBe(1);
        expect(compareVersions("3.7.0", "9.0.0")).toBe(-1);
    });

    it("speaks Spanish only when Obsidian does", () => {
        const text = { en: "Undo", es: "Deshacer" };
        expect(pick(text, "es")).toBe("Deshacer");
        expect(pick(text, "en")).toBe("Undo");
        expect(pick(text, "fr")).toBe("Undo");
    });
});

describe("a broken catalog fails, naming the entry (#801 AC-1)", () => {
    const cases: [string, RegExp][] = [
        ["missing-image.json", /^tutorials\.undo\.steps\[0\]\.image: docs\/resources\/undo\/nowhere\.svg does not exist$/],
        ["missing-doc.json", /^tutorials\.undo\.doc: docs\/architecture\/nowhere\.md does not exist$/],
        ["unknown-capability.json", /^tutorials\.undo\.tryIt\.capability: "launch-rockets" is not a capability$/],
        ["missing-es.json", /^tutorials\.undo\.summary\.es: missing or empty$/],
        ["two-tracks.json", /^tutorials\.undo: is in 2 tracks \(basics, again\)$/],
        ["two-steps.json", /^tutorials\.undo\.steps: 2 steps \(needs 3–6\)$/],
    ];

    it.each(cases)("%s", (file, expected) => {
        const problems = shown(validateLearnCatalog(readJson(join(FIXTURES, file)), ctx));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(expected);
    });

    it("refuses a tutorial about a newer plugin, and a schema it cannot read", () => {
        const raw = readJson(join(FIXTURES, "two-steps.json")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        raw.schema.major = 2;
        raw.tutorials.undo.since = "9.0.0";
        const problems = shown(validateLearnCatalog(raw, ctx));
        expect(problems).toContain("schema.major: 2 (this plugin reads 1)");
        expect(problems).toContain(`tutorials.undo.since: 9.0.0 is newer than the plugin (${MANIFEST.version})`);
    });
});

describe("the published catalog (#801 AC-1, FR-1–FR-4)", () => {
    const raw = readJson(CATALOG) as { tracks: unknown[]; tutorials: Record<string, unknown>; reference: unknown[]; faq: unknown[] };

    it("validates against the docs on disk, CAPABILITIES and the manifest", () => {
        expect(shown(validateLearnCatalog(raw, ctx))).toEqual([]);
    });

    it("carries the whole draft: eight tracks, the tutorials, the reference and the FAQ", () => {
        expect(raw.tracks.length).toBe(8);
        expect(Object.keys(raw.tutorials).length).toBeGreaterThanOrEqual(34);
        expect(raw.reference.length).toBeGreaterThanOrEqual(95);
        expect(raw.faq.length).toBeGreaterThanOrEqual(11);
    });

    it("has the tutorial Contribute opens (FR-2)", () => {
        expect(raw.tutorials["contribute-a-system"]).toBeDefined();
    });

    it("sends an en reader only to settings groups the tab shows", () => {
        const unknown = strings(raw, "en").flatMap(([path, text]) =>
            settingsPaths(text)
                .filter((hit) => !isKnownGroup(hit.segment))
                .map((hit) => `${path} → ${hit.segment}`)
        );
        expect(unknown).toEqual([]);
    });

    it("names es settings groups, the thinking space and the Library as the es plugin does", () => {
        const ES = es as Record<string, string>;
        const groups = new Set(
            Object.entries(ES)
                .filter(([key]) => /^settings_section_[a-z]+$/.test(key) || /^settings_.+_heading$/.test(key))
                .map(([, value]) => value)
        );
        // Obsidian's own pages, in Spanish: the same closed set as the en check.
        const obsidian = ["Complementos de la comunidad", "Archivos y enlaces", "Apariencia", "Atajos de teclado", "Editor", "Acerca de", "Complementos principales", "Sincronización"];
        const texts = strings(raw, "es");
        const wrongGroups = texts.flatMap(([path, text]) =>
            [...text.matchAll(/\bAjustes\s*[›→>]\s*([^.,:;()›→>—]+?)(?=\s*(?:[.,:;()›→>—]|$))/g)]
                .map((match) => match[1].trim())
                .filter((group) => group !== "ZettelFlow" && !groups.has(group) && !obsidian.includes(group))
                .map((group) => `${path} → ${group}`)
        );
        expect(wrongGroups).toEqual([]);
        expect(texts.filter(([, text]) => /\bThink\b/.test(text)).map(([path]) => path)).toEqual([]);
        expect(texts.filter(([, text]) => /librería/i.test(text)).map(([path]) => path)).toEqual([]);
    });
});

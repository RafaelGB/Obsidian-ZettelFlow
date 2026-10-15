import { describe, it, expect } from "@jest/globals";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseTemplate } from "application/template/zfTemplate";
import { validateSystemTemplate, REGISTERED_ACTION_IDS } from "application/community/systemInstall";
import { drawingOf } from "application/community/systemDrawing";
import { matchesQuery } from "application/community/systemsCatalog";
import { parseYamlForTests } from "../../support/systemsFixtures";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CATALOG = join(REPO_ROOT, "docs", "main_template.json");

interface CatalogEntry {
    id: string;
    template_type: string;
    ref: string;
    title: string;
    description: string;
    author: string;
    summary?: { en?: string; es?: string };
    steps?: number;
    branches?: number;
}

/** Resolve a catalog `ref` (a repo-absolute path like `/docs/systems/x.zftemplate`) to a real path. */
function resolveRef(ref: string): string {
    return join(REPO_ROOT, ref.replace(/^\//, ""));
}

describe("community catalog systems (#215, AC-3/AC-6, FR-9)", () => {
    const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as CatalogEntry[];
    const systems = catalog.filter((entry) => entry.template_type === "system");

    it("ships the shipped systems", () => {
        const refs = systems.map((s) => s.ref);
        for (const ref of [
            "/docs/systems/academic-research.zftemplate",
            "/docs/systems/zettelkasten-v2.zftemplate",
            "/docs/systems/para-v2.zftemplate",
            "/docs/systems/gtd.zftemplate",
            "/docs/systems/reading.zftemplate",
            "/docs/systems/writing.zftemplate",
            "/docs/systems/software-architecture-kb.zftemplate",
            "/docs/systems/meeting-notes.zftemplate",
            "/docs/systems/daily-journal.zftemplate",
            "/docs/systems/concept-note.zftemplate",
            "/docs/systems/decision-journal.zftemplate",
            "/docs/systems/inquiry.zftemplate",
        ]) {
            expect(refs).toContain(ref);
        }
    });

    it("has unique ids and refs across the whole catalog", () => {
        const ids = catalog.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        const systemRefs = systems.map((s) => s.ref);
        expect(new Set(systemRefs).size).toBe(systemRefs.length);
    });

    it("every system entry resolves to a valid .zftemplate with a sibling preview drawing", () => {
        for (const entry of systems) {
            expect(entry.ref.endsWith(".zftemplate")).toBe(true);
            const templatePath = resolveRef(entry.ref);
            expect({ ref: entry.ref, exists: existsSync(templatePath) }).toEqual({ ref: entry.ref, exists: true });

            const template = parseTemplate(readFileSync(templatePath, "utf8"));
            expect({ ref: entry.ref, problems: validateSystemTemplate(template, REGISTERED_ACTION_IDS) }).toEqual({
                ref: entry.ref,
                problems: [],
            });

            // The preview is an SVG drawing of the system's canvas (#651); its PNG sibling is rendered
            // from it for releases that only ever asked for `<id>.png`.
            for (const ext of [".svg", ".png"]) {
                const imagePath = resolveRef(entry.ref.replace(/\.zftemplate$/, ext));
                expect({ ref: entry.ref, ext, image: existsSync(imagePath) }).toEqual({ ref: entry.ref, ext, image: true });
            }
        }
    });

    it("each system carries a one-line summary in English and Spanish (#799 FR-3)", () => {
        for (const entry of systems) {
            const summary = entry.summary ?? {};
            expect({ ref: entry.ref, en: typeof summary.en, es: typeof summary.es }).toEqual({ ref: entry.ref, en: "string", es: "string" });
            expect((summary.en ?? "").length).toBeGreaterThan(0);
            expect((summary.es ?? "").length).toBeGreaterThan(0);
        }
    });

    it("each system's step and branch counts are what its own canvas draws (#799, AC-13)", () => {
        // The room groups by these before any template is fetched, so they must never drift.
        for (const entry of systems) {
            const template = parseTemplate(readFileSync(resolveRef(entry.ref), "utf8"));
            const drawing = drawingOf(template, parseYamlForTests);
            expect({ ref: entry.ref, steps: entry.steps, branches: entry.branches }).toEqual({
                ref: entry.ref,
                steps: drawing.steps,
                branches: drawing.branches,
            });
        }
    });

    it("finds only PARA for «para», as the hand script says (#799)", () => {
        const hits = (query: string) => systems.filter((entry) => matchesQuery(entry as never, query, "en")).map((entry) => entry.title);
        expect(hits("para")).toEqual(["PARA v2"]);
        // The description counts too: the concept note stamps a Zettel id.
        expect(hits("zettel")).toEqual(["Zettelkasten v2", "Concept note"]);
        expect(hits("zzz")).toEqual([]);
    });

    it("each system entry has non-empty metadata", () => {
        for (const entry of systems) {
            for (const field of [entry.id, entry.title, entry.description, entry.author]) {
                expect(typeof field).toBe("string");
                expect(field.length).toBeGreaterThan(0);
            }
        }
    });
});

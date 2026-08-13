import { describe, it, expect } from "@jest/globals";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseTemplate } from "application/template/zfTemplate";
import { validateSystemTemplate, REGISTERED_ACTION_IDS } from "application/community/systemInstall";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CATALOG = join(REPO_ROOT, "docs", "main_template.json");

interface CatalogEntry {
    id: string;
    template_type: string;
    ref: string;
    title: string;
    description: string;
    author: string;
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

    it("every system entry resolves to a valid .zftemplate with a sibling preview image", () => {
        for (const entry of systems) {
            expect(entry.ref.endsWith(".zftemplate")).toBe(true);
            const templatePath = resolveRef(entry.ref);
            expect({ ref: entry.ref, exists: existsSync(templatePath) }).toEqual({ ref: entry.ref, exists: true });

            const template = parseTemplate(readFileSync(templatePath, "utf8"));
            expect({ ref: entry.ref, problems: validateSystemTemplate(template, REGISTERED_ACTION_IDS) }).toEqual({
                ref: entry.ref,
                problems: [],
            });

            // The modal derives the preview URL as the sibling `.png`; ship at least a placeholder.
            const imagePath = resolveRef(entry.ref.replace(/\.zftemplate$/, ".png"));
            expect({ ref: entry.ref, image: existsSync(imagePath) }).toEqual({ ref: entry.ref, image: true });
        }
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

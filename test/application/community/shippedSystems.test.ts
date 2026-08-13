import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { parseTemplate } from "application/template/zfTemplate";
import { validateSystemTemplate, REGISTERED_ACTION_IDS } from "application/community/systemInstall";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const DOCS = join(REPO_ROOT, "docs");
const SEED = join(__dirname, "fixtures", "seed.zftemplate");

function findTemplates(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...findTemplates(full));
        else if (entry.endsWith(".zftemplate")) out.push(full);
    }
    return out;
}

describe("every shipped .zftemplate system is valid (#214, FR-8, AC-2)", () => {
    const files = [SEED, ...findTemplates(DOCS)];

    it("parses and validates every system against the registered action ids", () => {
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const template = parseTemplate(readFileSync(file, "utf8"));
            expect({ file, problems: validateSystemTemplate(template, REGISTERED_ACTION_IDS) }).toEqual({
                file,
                problems: [],
            });
        }
    });
});

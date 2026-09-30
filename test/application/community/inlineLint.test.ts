import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { parseTemplate } from "application/template/zfTemplate";
import { validateSystemTemplate, REGISTERED_ACTION_IDS } from "application/community/systemInstall";

/**
 * The inline-lint guardrail (#612, FR-6/AC-4).
 *
 * `validateSystemTemplate` historically linted only `type:"file"` steps via their frontmatter. As the
 * community systems are rebuilt as canvas-native **inline** boxes (config on the node's
 * `zettelflowConfig`, `steps: []`), the same offline/no-AI and unknown-action checks must reach those
 * nodes — otherwise a rebuilt system ships **unlinted**. This suite proves the walk: shipped systems
 * carry no inline problem, and two crafted fixtures (an unknown action, an AI action) are rejected.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");
const DOCS = join(REPO_ROOT, "docs");
const FIXTURES = join(__dirname, "fixtures");

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

const load = (file: string) => parseTemplate(readFileSync(file, "utf8"));
const inlineProblems = (file: string) =>
    validateSystemTemplate(load(file), REGISTERED_ACTION_IDS).filter((p) => p.startsWith("Inline node "));

describe("the inline-lint guardrail (#612)", () => {
    it("finds no inline problem in any shipped system", () => {
        const files = findTemplates(DOCS);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            expect({ file, inline: inlineProblems(file) }).toEqual({ file, inline: [] });
        }
    });

    it("rejects an inline node that uses an unknown action type", () => {
        expect(inlineProblems(join(FIXTURES, "inline-unknown-action.zftemplate"))).toEqual([
            'Inline node "bad" uses unknown action type "teleport-note"',
        ]);
    });

    it("rejects an inline node that uses an AI action (offline rule)", () => {
        expect(inlineProblems(join(FIXTURES, "inline-ai-action.zftemplate"))).toEqual([
            'Inline node "bad" uses AI action "summarize" (offline rule)',
        ]);
    });
});

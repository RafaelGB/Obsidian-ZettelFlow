import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import type { App } from "obsidian";
import type { ZfTemplate } from "application/template/zfTemplate";
import { executableCodeSites } from "application/community/systemInstall";
import {
    bindingNames,
    SCRIPT_ACTION_BINDINGS,
    DYNAMIC_SELECTOR_BINDINGS,
} from "architecture/api/bindings/scriptBindings";
import { syntaxDiagnostics } from "architecture/components/core/codeView/editor/extensions/apiCompletion/syntaxLint";
import { ZfKnowledge } from "architecture/api/lib/knowledge/service/ZfKnowledge";
import { ZfAi } from "architecture/api/lib/ai/service/ZfAi";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

// test/application/community → 3 ups → repo root
const SYSTEMS = join(__dirname, "..", "..", "..", "docs", "systems");

const BINDINGS_BY_ACTION: Record<string, readonly { name: string; type: string }[]> = {
    script: SCRIPT_ACTION_BINDINGS,
    "dynamic-selector": DYNAMIC_SELECTOR_BINDINGS,
};

/** Every binding name any surface injects — the set a shipped script must stay inside. */
const ALL_BINDING_NAMES = new Set([
    ...bindingNames(SCRIPT_ACTION_BINDINGS),
    ...bindingNames(DYNAMIC_SELECTOR_BINDINGS),
    "event",
]);

interface ShippedScript {
    system: string;
    step: string;
    actionType: string;
    code: string;
}

/**
 * Pull the `code: |` block scalars out of a step's frontmatter, by indentation — the same structural
 * approach `systemInstall` uses, and dependency-free (js-yaml is only a transitive package here).
 */
function codeBlocks(frontmatter: string): { actionType: string; code: string }[] {
    const lines = frontmatter.split("\n");
    const blocks: { actionType: string; code: string }[] = [];
    let currentType = "";

    for (let i = 0; i < lines.length; i++) {
        const typeMatch = lines[i].match(/^\s*-?\s*type:\s*["']?([\w-]+)/);
        if (typeMatch) currentType = typeMatch[1];

        const opener = lines[i].match(/^(\s*)code:\s*[|>][+-]?\d*\s*$/);
        if (!opener) continue;

        const indent = opener[1].length;
        const body: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
            const line = lines[j];
            const lineIndent = line.length - line.trimStart().length;
            if (line.trim() !== "" && lineIndent <= indent) break;
            body.push(line.slice(indent + 2));
        }
        blocks.push({ actionType: currentType, code: body.join("\n").trimEnd() });
    }
    return blocks;
}

function shippedScripts(): ShippedScript[] {
    const out: ShippedScript[] = [];
    for (const file of readdirSync(SYSTEMS).filter((name) => name.endsWith(".zftemplate"))) {
        const template = JSON.parse(readFileSync(join(SYSTEMS, file), "utf8")) as ZfTemplate;
        if (executableCodeSites(template).length === 0) continue;
        for (const step of template.steps) {
            const frontmatter = step.content.match(/^---\n([\s\S]*?)\n---/)?.[1];
            if (!frontmatter) continue;
            for (const block of codeBlocks(frontmatter)) {
                out.push({ system: file, step: step.filename, actionType: block.actionType, code: block.code });
            }
        }
    }
    return out;
}

/** Root identifiers the snippet dereferences, ignoring string contents. */
function rootsUsed(code: string): string[] {
    const stripped = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/\/\/.*$/gm, "");
    return [...new Set([...stripped.matchAll(/(^|[^\w.$])([A-Za-z_$][\w$]*)\s*\./gm)].map((m) => m[2]))];
}

async function apiMembers(): Promise<{ knowledge: Set<string>; ai: Set<string> }> {
    const knowledge = new ZfKnowledge({} as App, {
        model: () => new KnowledgeModel(),
        history: () => [],
        ready: () => true,
    });
    await knowledge.init();
    const ai = new ZfAi({} as App);
    await ai.init();
    return {
        knowledge: new Set(Object.keys(await knowledge.generate_object())),
        ai: new Set(Object.keys(await ai.generate_object())),
    };
}

/**
 * The flagship example of the scripting API must not rot (#353, AC-5). A shipped system installs in one
 * click into someone else's vault, so a script that references a member or a binding that no longer
 * exists fails in *their* workflow — and it is the example they will copy.
 */
describe("the scripts a shipped system installs stay true (#353, AC-5)", () => {
    const scripts = shippedScripts();

    it("finds the code the gallery ships", () => {
        expect(scripts.length).toBeGreaterThan(0);
        expect(scripts.every((script) => script.code.trim().length > 0)).toBe(true);
    });

    it.each(scripts.map((script) => [`${script.system} · ${script.actionType}`, script] as const))(
        "%s parses",
        (_label, script) => {
            const state = EditorState.create({
                doc: `(async () => {\n${script.code}\n})();`,
                extensions: [javascript()],
            });

            expect(syntaxDiagnostics(state)).toEqual([]);
        }
    );

    it.each(scripts.map((script) => [`${script.system} · ${script.actionType}`, script] as const))(
        "%s uses only the bindings its surface injects",
        (_label, script) => {
            const mine = new Set(bindingNames(BINDINGS_BY_ACTION[script.actionType] ?? []));
            const foreign = rootsUsed(script.code).filter(
                (root) => ALL_BINDING_NAMES.has(root) && !mine.has(root)
            );

            expect(foreign).toEqual([]);
        }
    );

    it("calls only zf members that exist", async () => {
        const { knowledge, ai } = await apiMembers();
        const offenders: string[] = [];

        for (const script of scripts) {
            for (const match of script.code.matchAll(/zf\.knowledge\.(\w+)/g)) {
                if (!knowledge.has(match[1])) offenders.push(`${script.system} → zf.knowledge.${match[1]}`);
            }
            for (const match of script.code.matchAll(/zf\.ai\.(\w+)/g)) {
                if (!ai.has(match[1])) offenders.push(`${script.system} → zf.ai.${match[1]}`);
            }
        }

        expect(offenders).toEqual([]);
    });

    it("guards on readiness before querying the index, as any honest example must", () => {
        for (const script of scripts) {
            if (!script.code.includes("zf.knowledge.")) continue;
            expect(`${script.system}:${script.code.includes("zf.knowledge.ready()")}`).toBe(
                `${script.system}:true`
            );
        }
    });

    it("returns option tuples from the dynamic selector, which is its whole contract", () => {
        for (const script of scripts.filter((s) => s.actionType === "dynamic-selector")) {
            expect(script.code).toMatch(/return\s+\[|return\s+\w+\.map\(/);
        }
    });
});

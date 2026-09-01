import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
    executableCodeSites,
    validateSystemTemplate,
    REGISTERED_ACTION_IDS,
    CODE_CARRYING_ACTION_IDS,
} from "application/community/systemInstall";
import type { ZfTemplate } from "application/template/zfTemplate";

// test/application/community → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const SYSTEMS = join(ROOT, "docs", "systems");

function step(filename: string, actionTypes: string[]): { filename: string; content: string } {
    const actions = actionTypes.map((type) => `  - type: ${type}\n    id: ${type}-1\n    hasUI: false`).join("\n");
    return {
        filename,
        content: `---\nzettelFlowSettings:\n  root: true\n  actions:\n${actions}\n---\n\nbody\n`,
    };
}

function template(steps: { filename: string; content: string }[]): ZfTemplate {
    return {
        zfVersion: "3.1.0",
        name: "Test",
        description: "d",
        author: "a",
        canvas: {
            filename: "Test.canvas",
            content: JSON.stringify({
                nodes: steps.map((s, i) => ({ id: `n-${i}`, type: "file", file: s.filename })),
                edges: [],
            }),
        },
        steps,
    } as unknown as ZfTemplate;
}

describe("a system that runs code says so before it installs (#353, FR-1/AC-1)", () => {
    it("names the steps that carry executable code", () => {
        const sites = executableCodeSites(
            template([step("A.md", ["prompt", "script"]), step("B.md", ["dynamic-selector"])])
        );

        expect(sites).toEqual([
            { filename: "A.md", actionType: "script" },
            { filename: "B.md", actionType: "dynamic-selector" },
        ]);
    });

    it("says nothing about a system built from stock actions", () => {
        expect(executableCodeSites(template([step("A.md", ["prompt", "tags", "find-related"])]))).toEqual([]);
    });

    /**
     * A conditional canvas edge looks like code but is read by a pure parser with no `eval` or
     * `Function` (`conditionEvaluator`). Listing it would be alarmist, and a disclosure nobody can
     * trust is worse than none.
     */
    it("does not cry wolf over a conditional edge, which executes nothing", () => {
        const withCondition = template([step("A.md", ["prompt"])]);
        const canvas = JSON.parse(withCondition.canvas.content) as { edges: unknown[] };
        canvas.edges = [{ id: "e-0", fromNode: "n-0", toNode: "n-0", label: "if: frontmatter.type === 'x'" }];
        withCondition.canvas.content = JSON.stringify(canvas);

        expect(executableCodeSites(withCondition)).toEqual([]);
    });

    it("reports each carrier once per step, not once per action", () => {
        const sites = executableCodeSites(template([step("A.md", ["script", "script", "prompt"])]));

        expect(sites).toHaveLength(1);
    });

    it("is defensive about a malformed bundle rather than throwing at install time", () => {
        expect(executableCodeSites({} as ZfTemplate)).toEqual([]);
        expect(executableCodeSites(template([{ filename: "A.md", content: "no frontmatter" }]))).toEqual([]);
    });

    it("treats exactly the two action types that build a function", () => {
        expect([...CODE_CARRYING_ACTION_IDS].sort()).toEqual(["dynamic-selector", "script"]);
    });
});

describe("a script is legitimate; an undisclosed script is not (#353, FR-2/AC-3)", () => {
    it("still accepts a scripted system as valid", () => {
        const scripted = template([step("A.md", ["script"])]);

        expect(validateSystemTemplate(scripted, REGISTERED_ACTION_IDS)).toEqual([]);
    });

    /**
     * Multi-line JavaScript in a step needs a YAML block scalar, and the hazard check used to reject
     * every block scalar as malformed — so shipping a system with a script was impossible, not merely
     * undisclosed.
     */
    it("accepts the block scalar that multi-line code requires", () => {
        const withCode = {
            filename: "A.md",
            content: [
                "---",
                "zettelFlowSettings:",
                "  root: true",
                "  actions:",
                "  - type: script",
                "    id: s1",
                "    hasUI: false",
                "    code: |",
                "      const x = { a: 1 };",
                "      content.addFrontMatter({ a: x.a });",
                "---",
                "",
                "body",
            ].join("\n"),
        };

        expect(validateSystemTemplate(template([withCode]), REGISTERED_ACTION_IDS)).toEqual([]);
    });

    it("still rejects a genuinely YAML-unsafe plain value", () => {
        const hostile = {
            filename: "A.md",
            content: [
                "---",
                "zettelFlowSettings:",
                "  root: true",
                "  label: [[not quoted]] and more",
                "  actions:",
                "  - type: prompt",
                "---",
                "",
                "body",
            ].join("\n"),
        };

        expect(validateSystemTemplate(template([hostile]), REGISTERED_ACTION_IDS).length).toBeGreaterThan(0);
    });
});

describe("the shipped gallery discloses what it ships (#353, AC-4)", () => {
    const files = readdirSync(SYSTEMS).filter((name) => name.endsWith(".zftemplate"));

    function load(name: string): ZfTemplate {
        return JSON.parse(readFileSync(join(SYSTEMS, name), "utf8")) as ZfTemplate;
    }

    it("finds the systems", () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it.each(files)("%s passes the same structural validation as every other system", (name) => {
        expect(validateSystemTemplate(load(name), REGISTERED_ACTION_IDS)).toEqual([]);
    });

    it("ships exactly one system that runs code, and it is the scripting showcase", () => {
        const scripted = files.filter((name) => executableCodeSites(load(name)).length > 0);

        expect(scripted).toEqual(["weekly-focus.zftemplate"]);
    });

    it("declares both code-carrying actions of that system, so the disclosure is complete", () => {
        const sites = executableCodeSites(load("weekly-focus.zftemplate"));

        expect(sites.map((site) => site.actionType).sort()).toEqual(["dynamic-selector", "script"]);
    });

    it("lists it in the gallery index with its difficulty declared", () => {
        const index = JSON.parse(readFileSync(join(ROOT, "docs", "main_template.json"), "utf8")) as {
            ref?: string;
            template_type?: string;
        }[];
        const refs = index.map((entry) => entry.ref ?? "");

        expect(refs).toContain("/docs/systems/weekly-focus.zftemplate");
        expect(load("weekly-focus.zftemplate").difficulty).toBe("hard");
    });

    /**
     * `difficulty` is a closed union in the settings types, but a `.zftemplate` is plain JSON — nothing
     * stops an author writing `"advanced"`, which silently renders no badge at all.
     */
    it.each(files)("%s declares a difficulty the gallery can render", (name) => {
        expect(["easy", "medium", "hard"]).toContain(load(name).difficulty);
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    planSystemInstall,
    validateSystemTemplate,
    REGISTERED_ACTION_IDS,
} from "application/community/systemInstall";
import type { ZfTemplate } from "application/template/zfTemplate";

const stepContent = "---\nzettelFlowSettings:\n  root: true\n  actions:\n    - type: prompt\n      key: title\n---\n# {{title}}\n";

const template: ZfTemplate = {
    zfVersion: "1.0",
    name: "Academic",
    description: "d",
    author: "a",
    canvas: { filename: "academic.canvas", content: '{"nodes":[],"edges":[]}' },
    steps: [{ filename: "Capture.md", content: stepContent }],
};

describe("planSystemInstall (#214, FR-6, AC-1)", () => {
    it("plans the canvas first then the steps under the target folder", () => {
        expect(planSystemInstall(template, "Systems/Academic")).toEqual({
            files: [
                { path: "Systems/Academic/academic.canvas", content: '{"nodes":[],"edges":[]}' },
                { path: "Systems/Academic/Capture.md", content: stepContent },
            ],
        });
    });

    it("writes at the vault root when the target is '/' or empty", () => {
        expect(planSystemInstall(template, "/").files[0].path).toBe("academic.canvas");
        expect(planSystemInstall(template, "").files[1].path).toBe("Capture.md");
    });
});

describe("validateSystemTemplate (#214, FR-7, AC-2)", () => {
    it("accepts a valid system", () => {
        expect(validateSystemTemplate(template, REGISTERED_ACTION_IDS)).toEqual([]);
    });

    it("flags a malformed bundle", () => {
        expect(validateSystemTemplate({} as ZfTemplate, REGISTERED_ACTION_IDS)).toEqual([
            "Not a valid .zftemplate: missing required fields",
        ]);
    });

    it("flags a step with no zettelFlowSettings frontmatter", () => {
        const bad: ZfTemplate = { ...template, steps: [{ filename: "Bare.md", content: "# just a note\n" }] };
        expect(validateSystemTemplate(bad, REGISTERED_ACTION_IDS)).toEqual([
            'Step "Bare.md" has no zettelFlowSettings frontmatter',
        ]);
    });

    it("flags an unknown action type", () => {
        const unknown = "---\nzettelFlowSettings:\n  actions:\n    - type: teleport-note\n---\n";
        const bad: ZfTemplate = { ...template, steps: [{ filename: "Bad.md", content: unknown }] };
        expect(validateSystemTemplate(bad, REGISTERED_ACTION_IDS)).toEqual([
            'Step "Bad.md" uses unknown action type "teleport-note"',
        ]);
    });

    it("knows the cognitive action ids the epic shipped", () => {
        for (const id of ["calculate-maturity", "find-related", "extract-claims", "thinking-simulator"]) {
            expect(REGISTERED_ACTION_IDS.has(id)).toBe(true);
        }
    });
});

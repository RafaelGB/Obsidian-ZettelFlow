import { describe, it, expect } from "@jest/globals";
import {
    planSystemInstall,
    validateSystemTemplate,
    isUnsafeFilename,
    sanitizeFolderSegment,
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

    it("rewrites canvas file-node paths to the install folder so references resolve", () => {
        const withNodes: ZfTemplate = {
            ...template,
            canvas: {
                filename: "academic.canvas",
                content: JSON.stringify({
                    nodes: [
                        { id: "a", type: "file", file: "_ZettelFlow/folders/Capture.md", x: 0, y: 0, width: 350, height: 160 },
                        { id: "b", type: "text", text: "## note" },
                        { id: "c", type: "file", file: "somewhere/Unrelated.md", x: 1, y: 1, width: 350, height: 160 },
                    ],
                    edges: [],
                }),
            },
        };
        const canvas = JSON.parse(planSystemInstall(withNodes, "Systems/Academic").files[0].content) as {
            nodes: Array<{ id: string; file?: string }>;
        };
        // The step file-node is repointed under the chosen folder…
        expect(canvas.nodes[0].file).toBe("Systems/Academic/Capture.md");
        // …a file-node that is not a shipped step is left untouched…
        expect(canvas.nodes[2].file).toBe("somewhere/Unrelated.md");
        // …and at the vault root the step node loses the folder prefix entirely.
        const atRoot = JSON.parse(planSystemInstall(withNodes, "/").files[0].content) as {
            nodes: Array<{ file?: string }>;
        };
        expect(atRoot.nodes[0].file).toBe("Capture.md");
    });

    it("leaves an unparseable canvas untouched (defensive)", () => {
        const broken: ZfTemplate = { ...template, canvas: { filename: "x.canvas", content: "not json" } };
        expect(planSystemInstall(broken, "F").files[0].content).toBe("not json");
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

    it("flags a canvas file-node with no matching step", () => {
        const orphan: ZfTemplate = {
            ...template,
            canvas: {
                filename: "academic.canvas",
                content: JSON.stringify({ nodes: [{ id: "x", type: "file", file: "Ghost.md" }], edges: [] }),
            },
        };
        expect(validateSystemTemplate(orphan, REGISTERED_ACTION_IDS)).toEqual([
            'Canvas file-node "Ghost.md" has no matching step',
        ]);
    });

    it("flags an unparseable canvas", () => {
        const broken: ZfTemplate = { ...template, canvas: { filename: "academic.canvas", content: "not json" } };
        expect(validateSystemTemplate(broken, REGISTERED_ACTION_IDS)).toEqual([
            'Canvas "academic.canvas" is not valid JSON',
        ]);
    });

    it("flags an unsafe canvas or step filename (path traversal) before any write", () => {
        const evil: ZfTemplate = {
            ...template,
            canvas: { filename: "../../.obsidian/plugins/x/main.js", content: "{}" },
            steps: [{ filename: "sub/Nested.md", content: stepContent }],
        };
        expect(validateSystemTemplate(evil, REGISTERED_ACTION_IDS)).toEqual([
            'Canvas "../../.obsidian/plugins/x/main.js" has an unsafe path',
            'Step "sub/Nested.md" has an unsafe path',
        ]);
    });
});

describe("isUnsafeFilename (#214 hardening)", () => {
    it("accepts a bare in-folder filename", () => {
        expect(isUnsafeFilename("Capture.md")).toBe(false);
        expect(isUnsafeFilename("My system.canvas")).toBe(false);
    });

    it("rejects separators, traversal, drive-absolute and empties", () => {
        for (const bad of ["../escape.md", "a/b.md", "a\\b.md", "/abs.md", "..", ".", "", "   ", "C:evil.md"]) {
            expect(isUnsafeFilename(bad)).toBe(true);
        }
    });
});

describe("sanitizeFolderSegment (#215 review, untrusted system name)", () => {
    it("keeps an ordinary system name", () => {
        expect(sanitizeFolderSegment("Academic research")).toBe("Academic research");
    });

    it("strips separators and traversal so a crafted name cannot escape the flows folder", () => {
        expect(sanitizeFolderSegment("../../.obsidian/plugins/x")).toBe("obsidian plugins x");
        expect(sanitizeFolderSegment("a/b\\c")).toBe("a b c");
        expect(sanitizeFolderSegment("..")).toBe("");
        expect(sanitizeFolderSegment("   ")).toBe("");
    });
});

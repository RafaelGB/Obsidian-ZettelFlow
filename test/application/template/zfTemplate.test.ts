import { describe, it, expect } from "@jest/globals";
import { buildTemplate, parseTemplate, ZF_TEMPLATE_VERSION } from "application/template/zfTemplate";

const CANVAS_FILE = { filename: "flow.canvas", content: "{}" };

describe("buildTemplate", () => {
    it("sets the correct zfVersion", () => {
        const t = buildTemplate("My flow", "desc", "author", CANVAS_FILE, []);
        expect(t.zfVersion).toBe(ZF_TEMPLATE_VERSION);
    });

    it("stores the supplied name", () => {
        const t = buildTemplate("My flow", "", "", CANVAS_FILE, []);
        expect(t.name).toBe("My flow");
    });

    it("stores canvas and steps", () => {
        const step = { filename: "step.md", content: "# Hello" };
        const t = buildTemplate("T", "", "", CANVAS_FILE, [step]);
        expect(t.canvas.filename).toBe("flow.canvas");
        expect(t.steps).toHaveLength(1);
        expect(t.steps[0].filename).toBe("step.md");
    });

    it("stores empty steps array when no steps", () => {
        const t = buildTemplate("T", "", "", CANVAS_FILE, []);
        expect(t.steps).toHaveLength(0);
    });
});

describe("parseTemplate", () => {
    it("round-trips a built template", () => {
        const original = buildTemplate("Round-trip", "d", "a", CANVAS_FILE, []);
        const parsed = parseTemplate(JSON.stringify(original));
        expect(parsed.name).toBe("Round-trip");
        expect(parsed.canvas.filename).toBe("flow.canvas");
    });

    it("throws when required canvas field is missing", () => {
        const bad = { zfVersion: "1.0", name: "T", steps: [] };
        expect(() => parseTemplate(JSON.stringify(bad))).toThrow();
    });

    it("throws when zfVersion is missing", () => {
        const bad = { name: "T", canvas: CANVAS_FILE, steps: [] };
        expect(() => parseTemplate(JSON.stringify(bad))).toThrow();
    });

    it("throws when canvas.content is not a string", () => {
        const bad = { zfVersion: "1.0", name: "T", description: "", author: "", canvas: { filename: "f.canvas", content: 42 }, steps: [] };
        expect(() => parseTemplate(JSON.stringify(bad))).toThrow();
    });

    it("throws when a step entry is malformed", () => {
        const bad = { zfVersion: "1.0", name: "T", description: "", author: "", canvas: CANVAS_FILE, steps: [{ filename: "s.md" }] };
        expect(() => parseTemplate(JSON.stringify(bad))).toThrow();
    });

    it("throws on non-object JSON", () => {
        expect(() => parseTemplate('"just a string"')).toThrow();
    });

    it("throws on invalid JSON", () => {
        expect(() => parseTemplate("not json")).toThrow();
    });
});

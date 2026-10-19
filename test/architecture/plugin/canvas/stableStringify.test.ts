import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import jss from "json-stable-stringify";
import { stableStringify } from "architecture/plugin/canvas/extensions/stableStringify";

/**
 * **The local port writes what the library wrote** (#833): byte for byte, because it is what users'
 * `.canvas` files already hold. `json-stable-stringify` stays a devDependency only, to be compared
 * against here; the bundle carries the port.
 */

const SPACE = { space: 2 };
const same = (value: unknown) => expect(stableStringify(value, SPACE)).toBe(jss(value, SPACE));

const SYSTEMS = join(__dirname, "..", "..", "..", "..", "docs", "systems");
const canvases = readdirSync(SYSTEMS)
    .filter((name) => name.endsWith(".zftemplate"))
    .map((name) => {
        const template = JSON.parse(readFileSync(join(SYSTEMS, name), "utf8")) as { canvas?: { content?: unknown } };
        const content = template.canvas?.content;
        return [name, typeof content === "string" ? (JSON.parse(content) as unknown) : content] as const;
    })
    .filter(([, canvas]) => canvas !== undefined);

describe("the canvas, as json-stable-stringify wrote it (#833)", () => {
    it("writes every gallery system's canvas the same", () => {
        expect(canvases.length).toBeGreaterThan(3);
        for (const [, canvas] of canvases) same(canvas);
    });

    it("keeps the library's key order: string order, so 10 before 2", () => {
        same({ "2": "b", "10": "a", b: 1, a: { z: 1, y: [3, 1] } });
        expect(stableStringify({ "2": 0, "10": 0 })).toBe('{"10":0,"2":0}');
    });

    it("writes an empty array and object as the library does — on two lines with space, [] and {} without", () => {
        same({ nodes: [], edges: [], meta: {} });
        expect(stableStringify({ edges: [] }, SPACE)).toBe(jss({ edges: [] }, SPACE));
        expect(stableStringify([], {})).toBe(jss([], {}));
    });

    it("skips undefined values, writes undefined items null, and honours toJSON", () => {
        same({ a: undefined, b: [undefined, 1, () => 0], c: () => 0, when: new Date(0), own: { toJSON: () => ({ x: 1 }) } });
        same({ zettelflowConfig: { step: { root: true, actions: [{ type: "prompt", label: "Title" }] } }, x: -0, y: null, s: 'a "quoted"\nline' });
        expect(stableStringify(undefined, SPACE)).toBe(jss(undefined, SPACE));
    });

    it("writes with no space as the library does", () => {
        const value = { nodes: [{ id: "a", x: 1 }], edges: [] };
        expect(stableStringify(value)).toBe(jss(value));
    });

    it("throws on a cycle through objects, as the library does — the patcher then writes plain JSON", () => {
        const loop: Record<string, unknown> = { a: 1 };
        loop.self = loop;
        expect(() => jss(loop, SPACE)).toThrow(TypeError);
        expect(() => stableStringify(loop, SPACE)).toThrow(TypeError);
        // The same object twice, side by side, is not a cycle.
        const shared = { k: 1 };
        same({ one: shared, two: shared });
    });
});

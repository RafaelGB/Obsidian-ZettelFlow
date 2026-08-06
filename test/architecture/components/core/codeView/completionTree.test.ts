import { describe, it, expect } from "@jest/globals";
import {
    findCompletions,
    isCompletionArray,
    KeyCompletionDefaults,
} from "architecture/components/core/codeView/editor/extensions/autoconfiguration/completionTree";
import type { Completion } from "architecture/components/core/codeView/editor/extensions/autoconfiguration/typing";

const DEFAULTS: KeyCompletionDefaults = { info: "ZF API", detail: "✨ ZettelFlow" };

const vaultLeaf: Completion[] = [
    { label: "resolveTFolder", type: "method", info: "", detail: "", boost: 99 },
];
const userLeaf: Completion[] = [
    { label: "myScript", type: "method", info: "", detail: "", boost: 99 },
];

const tree = {
    app: [{ label: "vault", type: "object", info: "", detail: "", boost: 99 }] as Completion[],
    zf: {
        internal: { vault: vaultLeaf, user: userLeaf },
        external: [{ label: "dv", type: "object", info: "", detail: "", boost: 99 }] as Completion[],
    },
};

describe("isCompletionArray", () => {
    it("detects a leaf array", () => {
        expect(isCompletionArray(vaultLeaf)).toBe(true);
        expect(isCompletionArray(tree.zf)).toBe(false);
    });
});

describe("findCompletions", () => {
    it("returns root keys when no segments drill in", () => {
        const result = findCompletions(["zf"], tree, DEFAULTS);
        const labels = result?.map((c) => c.label);
        expect(labels).toEqual(["internal", "external"]);
    });

    it("drills into a nested node and lists its keys (vault AND user)", () => {
        const result = findCompletions(["zf", "internal"], tree, DEFAULTS);
        const labels = result?.map((c) => c.label);
        expect(labels).toEqual(["vault", "user"]);
    });

    it("returns the leaf completion array at a terminal node", () => {
        const result = findCompletions(["zf", "internal", "vault"], tree, DEFAULTS);
        expect(result).toBe(vaultLeaf);
    });

    it("falls back to sibling keys on an unknown segment", () => {
        const result = findCompletions(["zf", "nope"], tree, DEFAULTS);
        const labels = result?.map((c) => c.label);
        expect(labels).toEqual(["internal", "external"]);
    });

    it("applies the provided defaults to generated key completions", () => {
        const result = findCompletions(["zf"], tree, { info: "X", detail: "Y", boost: 5, type: "property" });
        expect(result?.[0]).toMatchObject({ info: "X", detail: "Y", boost: 5, type: "property" });
    });

    it("returns null when walking past a non-object leaf value", () => {
        const weird = { a: { b: "not-an-object" } } as unknown as Record<string, unknown>;
        expect(findCompletions(["a", "b"], weird, DEFAULTS)).toBeNull();
    });
});

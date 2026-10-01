import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";

const props: FieldDescriptor[] = [{ id: "note.x", name: "X" }];
const entries: AdaptedEntry[] = [
    { path: "a.md", cells: { "note.x": { kind: "number", display: "1", raw: 1 } } },
];

describe("identity-keyed memoization (AC-3)", () => {
    it("returns the same snapshot object when the signature is unchanged", () => {
        const first = normalize(entries, props, "sig-A");
        const second = normalize(entries, props, "sig-A", first);
        expect(second).toBe(first);
    });

    it("recomputes a fresh snapshot when the signature changes", () => {
        const first = normalize(entries, props, "sig-A");
        const third = normalize(entries, props, "sig-B", first);
        expect(third).not.toBe(first);
        expect(third.signature).toBe("sig-B");
    });
});

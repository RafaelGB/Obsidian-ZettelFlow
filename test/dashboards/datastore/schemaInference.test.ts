import { describe, it, expect } from "@jest/globals";
import { inferFieldType, normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor, TaggedCell } from "dashboards/datastore";

function cell(kind: TaggedCell["kind"], display: string, raw: TaggedCell["raw"]): TaggedCell {
    return { kind, display, raw };
}

const props: FieldDescriptor[] = [
    { id: "note.when", name: "When" },
    { id: "note.hours", name: "Hours" },
    { id: "note.mood", name: "Mood" },
    { id: "note.done", name: "Done" },
    { id: "note.ref", name: "Ref" },
    { id: "note.mixed", name: "Mixed" },
    { id: "note.blank", name: "Blank" },
];

const entries: AdaptedEntry[] = [
    {
        path: "a.md",
        cells: {
            "note.when": cell("date", "2026-01-01", "2026-01-01"),
            "note.hours": cell("number", "6", 6),
            "note.mood": cell("category", "good", "good"),
            "note.done": cell("boolean", "true", true),
            "note.ref": cell("link", "[[X]]", "[[X]]"),
            "note.mixed": cell("number", "3", 3),
            "note.blank": cell(null, "", null),
        },
    },
    {
        path: "b.md",
        cells: {
            "note.when": cell("date", "2026-01-02", "2026-01-02"),
            "note.hours": cell("number", "7", 7),
            "note.mood": cell("category", "ok", "ok"),
            "note.done": cell("boolean", "false", false),
            "note.ref": cell("link", "[[Y]]", "[[Y]]"),
            "note.mixed": cell("category", "weird", "weird"),
            "note.blank": cell(null, "", null),
        },
    },
];

describe("schema inference (AC-2)", () => {
    const snap = normalize(entries, props, "sig-1");

    it("infers one type per consistent field", () => {
        expect(snap.schema.byId["note.when"].type).toBe("date");
        expect(snap.schema.byId["note.hours"].type).toBe("number");
        expect(snap.schema.byId["note.mood"].type).toBe("category");
        expect(snap.schema.byId["note.done"].type).toBe("boolean");
        expect(snap.schema.byId["note.ref"].type).toBe("link");
    });

    it("is unknown for a column with mixed non-empty kinds", () => {
        expect(snap.schema.byId["note.mixed"].type).toBe("unknown");
    });

    it("is unknown for a column with only empty cells", () => {
        expect(snap.schema.byId["note.blank"].type).toBe("unknown");
    });

    it("keeps the configured field order and the display name", () => {
        expect(snap.schema.fields.map((f) => f.id)).toEqual(props.map((p) => p.id));
        expect(snap.schema.byId["note.hours"].name).toBe("Hours");
    });

    it("produces flat, typed, display-ready rows + indexes + count", () => {
        expect(snap.rowCount).toBe(2);
        expect(snap.rows[0]["note.hours"]).toEqual({ kind: "number", display: "6", raw: 6 });
        expect(snap.indexes["note.mood"]["good"]).toEqual([0]);
        expect(snap.indexes["note.mood"]["ok"]).toEqual([1]);
    });
});

describe("inferFieldType", () => {
    it("ignores nulls and collapses a single kind", () => {
        expect(inferFieldType(["number", null, "number"])).toBe("number");
    });

    it("is unknown when empty or conflicting", () => {
        expect(inferFieldType([null, null])).toBe("unknown");
        expect(inferFieldType(["number", "category"])).toBe("unknown");
    });
});

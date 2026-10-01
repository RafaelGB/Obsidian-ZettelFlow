import { describe, it, expect } from "@jest/globals";
import {
    BasesEntry,
    BasesQueryResult,
    BooleanValue,
    DateValue,
    LinkValue,
    NullValue,
    NumberValue,
    ObjectValue,
    StringValue,
    TFile,
} from "obsidian";
import { adaptEntry, deriveSignature } from "dashboards/base/adaptEntry";
import type { FieldDescriptor } from "dashboards/datastore";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    return f;
}

const props: FieldDescriptor[] = [
    { id: "note.hours", name: "Hours" },
    { id: "note.mood", name: "Mood" },
    { id: "note.done", name: "Done" },
    { id: "note.when", name: "When" },
    { id: "note.ref", name: "Ref" },
    { id: "note.obj", name: "Obj" },
    { id: "note.empty", name: "Empty" },
];

describe("adaptEntry — the Value → TaggedCell boundary (AC-2)", () => {
    const entry = new BasesEntry(file("a.md"), {
        "note.hours": new NumberValue(6),
        "note.mood": new StringValue("good"),
        "note.done": new BooleanValue(true),
        "note.when": new DateValue("2026-01-01"),
        "note.ref": new LinkValue("[[X]]"),
        "note.obj": new ObjectValue(),
        "note.empty": NullValue.value,
    });
    const adapted = adaptEntry(entry, props);

    it("maps each Value subclass to the right kind through the public surface", () => {
        expect(adapted.cells["note.hours"]).toEqual({ kind: "number", display: "6", raw: 6 });
        expect(adapted.cells["note.mood"]).toEqual({ kind: "category", display: "good", raw: "good" });
        expect(adapted.cells["note.done"]).toEqual({ kind: "boolean", display: "true", raw: true });
        expect(adapted.cells["note.when"].kind).toBe("date");
    });

    it("maps a link before a plain string (LinkValue extends StringValue)", () => {
        expect(adapted.cells["note.ref"].kind).toBe("link");
    });

    it("shows but does not type an object / unknown value", () => {
        expect(adapted.cells["note.obj"].kind).toBe("unknown");
    });

    it("treats an absent / null value as an empty cell", () => {
        expect(adapted.cells["note.empty"]).toEqual({ kind: null, display: "", raw: null });
    });

    it("records the note path as identity", () => {
        expect(adapted.path).toBe("a.md");
    });
});

describe("deriveSignature (AC-2 — changes iff paths / props / sort change)", () => {
    const config = {
        getDisplayName: (id: string) => id,
        getSort: () => [{ property: "note.when", direction: "ASC" }],
    };
    const result = (paths: string[], propIds: string[]) =>
        new BasesQueryResult(paths.map((p) => new BasesEntry(file(p), {})), propIds);

    it("is stable for the same paths, properties and sort", () => {
        const a = deriveSignature(result(["a.md", "b.md"], ["note.x"]), config);
        const b = deriveSignature(result(["a.md", "b.md"], ["note.x"]), config);
        expect(a).toBe(b);
    });

    it("changes when the paths change", () => {
        const a = deriveSignature(result(["a.md"], ["note.x"]), config);
        const b = deriveSignature(result(["a.md", "b.md"], ["note.x"]), config);
        expect(a).not.toBe(b);
    });

    it("changes when the visible properties change", () => {
        const a = deriveSignature(result(["a.md"], ["note.x"]), config);
        const b = deriveSignature(result(["a.md"], ["note.x", "note.y"]), config);
        expect(a).not.toBe(b);
    });
});

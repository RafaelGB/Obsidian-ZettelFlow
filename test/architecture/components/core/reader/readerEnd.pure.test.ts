import { describe, it, expect } from "@jest/globals";
import {
    deleteReading,
    normalizeSaved,
    renameReading,
    saveReading,
    savedId,
    savedThrough,
    SAVED_LIMIT,
    type SavedReading,
} from "architecture/components/core/reader/readerSaved";
import {
    buildReadingDocument,
    exportFileName,
    freeExportPath,
} from "architecture/components/core/reader/readerDocument";

const reading = (id: string, paths: string[], at = 1): SavedReading => ({
    id,
    name: `Reading ${id}`,
    kind: "around",
    seed: paths[0],
    paths,
    at,
});

describe("saved readings (#672)", () => {
    it("keeps the newest first and replaces the same chapters saved again", () => {
        let list = saveReading([], reading("a", ["x.md", "y.md"], 1));
        list = saveReading(list, reading("b", ["z.md"], 2));
        list = saveReading(list, reading("c", ["x.md", "y.md"], 3));
        expect(list.map((entry) => entry.id)).toEqual(["c", "b"]);
    });

    it("forgets the oldest past the limit", () => {
        let list: SavedReading[] = [];
        for (let i = 0; i < SAVED_LIMIT + 5; i++) list = saveReading(list, reading(`r${i}`, [`n${i}.md`], i));
        expect(list).toHaveLength(SAVED_LIMIT);
        expect(list[0].id).toBe(`r${SAVED_LIMIT + 4}`);
    });

    it("renames, ignoring an empty name, and deletes", () => {
        const list = [reading("a", ["x.md"]), reading("b", ["y.md"])];
        expect(renameReading(list, "a", "  My path ")[0].name).toBe("My path");
        expect(renameReading(list, "a", "   ")[0].name).toBe("Reading a");
        expect(deleteReading(list, "a").map((entry) => entry.id)).toEqual(["b"]);
    });

    it("offers the readings that pass through a note", () => {
        const list = [reading("a", ["x.md", "y.md"]), reading("b", ["z.md"])];
        expect(savedThrough(list, "y.md").map((entry) => entry.id)).toEqual(["a"]);
        expect(savedThrough(list, "q.md")).toEqual([]);
    });

    it("reads a stored list defensively", () => {
        expect(normalizeSaved(null)).toEqual([]);
        expect(
            normalizeSaved([
                reading("ok", ["x.md"]),
                { id: "bad-kind", name: "n", kind: "nope", seed: "x.md", paths: ["x.md"], at: 1 },
                { id: "no-paths", name: "n", kind: "around", seed: "x.md", paths: [], at: 1 },
                "junk",
            ]).map((entry) => entry.id)
        ).toEqual(["ok"]);
    });

    it("makes ids that differ by moment and chapters", () => {
        expect(savedId(["x.md"], 1)).not.toBe(savedId(["x.md"], 2));
        expect(savedId(["x.md"], 1)).not.toBe(savedId(["y.md"], 1));
    });
});

describe("one document from a reading (#672)", () => {
    const chapters = [
        { name: "Event sourcing", link: "Event sourcing", body: "State is history.\n\nMore." },
        { name: "CQRS", link: "Zettel/CQRS", body: "" },
    ];
    const highlights = [
        { note: "Event sourcing", passage: "State is history.", comment: "The core idea" },
        { note: "Event sourcing", passage: "line one\nline two" },
        { note: "CQRS", passage: "Split the models." },
    ];

    it("embeds each chapter by default — nothing duplicated, the export stays live", () => {
        const md = buildReadingDocument({ title: "Distributed systems", intro: "Read as Around.", chapters, highlights: [], mode: "embed", appendixTitle: "Your highlights" });
        expect(md).toBe(
            "# Distributed systems\n\nRead as Around.\n\n## 1. Event sourcing\n\n![[Event sourcing]]\n\n## 2. CQRS\n\n![[Zettel/CQRS]]\n"
        );
    });

    it("copies the text in copy mode, falling back to an embed for an empty note", () => {
        const md = buildReadingDocument({ title: "T", intro: "I", chapters, highlights: [], mode: "copy", appendixTitle: "A" });
        expect(md).toContain("## 1. Event sourcing\n\nState is history.\n\nMore.\n");
        expect(md).toContain("## 2. CQRS\n\n![[Zettel/CQRS]]\n");
    });

    it("appends your highlights, grouped by note, with your notes under each passage", () => {
        const md = buildReadingDocument({ title: "T", intro: "I", chapters, highlights, mode: "embed", appendixTitle: "Your highlights" });
        const appendix = md.slice(md.indexOf("## Your highlights"));
        expect(appendix).toBe(
            "## Your highlights\n\n### Event sourcing\n\n> State is history.\n\nThe core idea\n\n> line one\n> line two\n\n### CQRS\n\n> Split the models.\n"
        );
    });

    it("leaves the appendix out when there is nothing to put in it", () => {
        expect(buildReadingDocument({ title: "T", intro: "I", chapters, highlights: [], mode: "embed", appendixTitle: "Your highlights" })).not.toContain("Your highlights");
    });

    it("names the file safely and never overwrites", () => {
        expect(exportFileName("Systems: a reading?")).toBe("Systems a reading.md");
        expect(exportFileName("   ")).toBe("Reading.md");
        const taken = new Set(["Zettel/Systems.md", "Zettel/Systems 2.md"]);
        expect(freeExportPath("Zettel/", "Systems.md", (p) => taken.has(p))).toBe("Zettel/Systems 3.md");
        expect(freeExportPath("", "Free.md", () => false)).toBe("Free.md");
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    buildInkReadingRequest,
    inkImageLayout,
    INK_IMAGE_MAX_PX,
    INK_READING_MAX,
    matchNamedNote,
    parseInkReading,
    passageAround,
    proposedMove,
} from "application/reader/ink/inkReading";
import type { InkDrawing } from "application/reader/ink/inkSvg";

const TITLES = [
    { path: "Ideas/Ship early, learn from reality.md", title: "Ship early, learn from reality" },
    { path: "Ideas/Shipping logs.md", title: "Shipping logs" },
    { path: "Ideas/Café culture.md", title: "Café culture" },
];

describe("what is asked (#748 FR-3, AC-2)", () => {
    it("carries the task and the passage, capped and delimited as data — nothing else from the vault", () => {
        const passage = "Big projects fail because they start building before they finish thinking.";
        const { prompt } = buildInkReadingRequest({ passage, maxChars: 12_000 });
        expect(prompt).toContain(`<note-content>\n${passage}\n</note-content>`);
        expect(prompt).toMatch(/Reply with JSON only/);
        // The builder has no field for a title, a path or another highlight: none can appear.
        for (const planted of ["Ship early, learn from reality", "Ideas/", ".md", "another highlight"]) expect(prompt).not.toContain(planted);
    });

    it("caps a long passage at the AI input limit", () => {
        const { prompt } = buildInkReadingRequest({ passage: "x".repeat(5000), maxChars: 600 });
        expect(prompt).toContain("x".repeat(600));
        expect(prompt).not.toContain("x".repeat(601));
        expect(prompt).toContain("truncated");
    });

    it("sends the sentence around the anchor, never the chapter", () => {
        const text = "First sentence here. The anchored word sits in this one. Third goes on and on.";
        const at = text.indexOf("anchored");
        expect(passageAround(text, { start: at, end: at + 8 })).toBe("The anchored word sits in this one.");
        const long = "a ".repeat(2000);
        expect(passageAround(long, { start: 2000, end: 2001 }).length).toBeLessThanOrEqual(601);
    });
});

describe("what comes back (#748 FR-5, AC-3)", () => {
    it("reads the JSON the model kept to, inside a fence or not", () => {
        expect(parseInkReading('{"reading":"contradicts \'ship early\'?","kind":"tension","names":"ship early"}')).toEqual({
            reading: "contradicts 'ship early'?",
            kind: "tension",
            names: "ship early",
        });
        expect(parseInkReading('```json\n{"reading":"why now?","kind":"question"}\n```')).toEqual({ reading: "why now?", kind: "question" });
    });

    it("takes anything unparseable as a plain reading, and nothing as nothing", () => {
        expect(parseInkReading("just some words")).toEqual({ reading: "just some words", kind: "plain" });
        expect(parseInkReading('{"reading": ')).toEqual({ reading: '{"reading":', kind: "plain" });
        expect(parseInkReading("   ")).toBeNull();
        expect(parseInkReading('{"reading":"","kind":"plain"}')).toBeNull();
    });

    it("sanitises and caps the reading, and drops an unknown kind and a stray name", () => {
        const long = parseInkReading(JSON.stringify({ reading: "w".repeat(1000), kind: "weird", names: "Ship early" }))!;
        expect(long.reading.length).toBe(INK_READING_MAX);
        expect(long.kind).toBe("plain");
        expect(long.names).toBeUndefined();
        expect(parseInkReading('{"reading":"see {{date}}","kind":"plain"}')!.reading).not.toContain("{{");
    });
});

describe("the move a confirmed reading proposes (#748 FR-8, AC-5)", () => {
    it("matches a named idea to one note title, locally: equal or a prefix, case and accents aside", () => {
        expect(matchNamedNote("ship early", TITLES)).toBe("Ideas/Ship early, learn from reality.md");
        expect(matchNamedNote("“Ship Early”", TITLES)).toBe("Ideas/Ship early, learn from reality.md");
        expect(matchNamedNote("cafe culture", TITLES)).toBe("Ideas/Café culture.md");
    });

    it("proposes nothing for two candidates, a short name, or no match", () => {
        expect(matchNamedNote("shipping", [...TITLES, { path: "b.md", title: "Shipping containers" }])).toBeNull();
        expect(matchNamedNote("ship", TITLES)).toBeNull();
        expect(matchNamedNote("move fast and break things", TITLES)).toBeNull();
        expect(matchNamedNote(undefined, TITLES)).toBeNull();
    });

    it("proposes only a tension with a note you have, or a question — never anything else", () => {
        expect(proposedMove({ reading: "contradicts?", kind: "tension", names: "ship early" }, "Ideas/S.md")).toEqual({ kind: "tension", path: "Ideas/S.md" });
        expect(proposedMove({ reading: "contradicts?", kind: "tension", names: "nothing" }, null)).toBeNull();
        expect(proposedMove({ reading: "why?", kind: "question" }, null)).toEqual({ kind: "question" });
        expect(proposedMove({ reading: "nice", kind: "plain" }, "Ideas/S.md")).toBeNull();
    });
});

describe("the strokes alone, as an image (#748 FR-3)", () => {
    const stroke = (x0: number, x1: number) => ({
        colour: "red" as const,
        pointerType: "pen",
        points: Array.from({ length: 6 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 5, y: i % 2, p: 0.5, tilt: Math.PI / 2, t: i * 8 })),
    });

    it("fits the drawing inside the bound on its long side, every stroke and nothing else", () => {
        const drawing: InkDrawing = { strokes: [stroke(0, 200), stroke(0, 10)] };
        const layout = inkImageLayout(drawing);
        expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(INK_IMAGE_MAX_PX);
        expect(layout.width).toBeGreaterThan(layout.height);
        expect(layout.segments).toHaveLength(2);
    });

    it("never blows a small note up past a hand's size", () => {
        const layout = inkImageLayout({ strokes: [stroke(0, 2)] });
        expect(layout.scale).toBeLessThanOrEqual(64);
        expect(layout.width).toBeLessThan(400);
    });
});

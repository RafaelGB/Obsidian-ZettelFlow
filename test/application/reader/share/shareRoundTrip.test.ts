import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pageWordsOf, type PdfWordItem } from "application/library/pdfWords";
import { quoteAt } from "application/thinking/quoteAnchor";
import type { Thought } from "application/thinking/thought";
import { highlightPayload, notePayload, placeHighlight, placeNotes, userSpaceGeometry, type PageBox } from "application/reader/share/shareMarks";
import { checkCopy, fillHoles, holeFor, startsWith, type PlannedMark, type ReadMark } from "application/reader/share/shareFill";
import { inkPayloads } from "application/reader/share/shareInk";
import { inkPayloads } from "application/reader/share/shareInk";

/**
 * **A shared copy, through the real pdf.js** (#842 AC-3, AC-6, AC-8, AC-9): the payloads the share
 * computes are saved by pdf.js 5.3 (the build closest to Obsidian 1.14.4's), the holes filled in place,
 * and the copy read back by pdf.js again — out of jest's process, since jest cannot load pdf.js.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const REAL = join(ROOT, "test", "support", "pdfjsReal.mjs");
const HAS_PDFJS = existsSync(join(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs"));

let dir = "";
let original = new Uint8Array();

function real<T>(request: Record<string, unknown>): T {
    const file = join(dir, `request-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(file, JSON.stringify(request));
    const out = execFileSync(process.execPath, [REAL, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const line = out.split("\n").find((each) => each.startsWith("@@zf "));
    if (!line) throw new Error(`no answer from pdfjsReal: ${out.slice(0, 400)}`);
    return JSON.parse(line.slice(5)) as T;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const forJson = (payload: Record<string, unknown>) =>
    JSON.parse(JSON.stringify(payload, (_key, value: unknown) => (value instanceof Float32Array ? Array.from(value) : value))) as Record<string, unknown>;

beforeAll(() => {
    if (!HAS_PDFJS) return;
    dir = mkdtempSync(join(tmpdir(), "zf-share-"));
    const pdf = join(dir, "formats.pdf");
    execFileSync(process.execPath, [join(ROOT, "scripts", "pdf-formats-sample.mjs"), pdf], { encoding: "utf8" });
    original = new Uint8Array(readFileSync(pdf));
});

afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
});

const describeReal = HAS_PDFJS ? describe : describe.skip;

describeReal("a shared copy, through the real pdf.js (#842)", () => {
    const COMMENT = "Revisa esto: ¿por qué así? (ñ) \\ fin\nY una segunda línea.";

    let page: { view: number[]; items: PdfWordItem[]; styles: Record<string, { fontFamily?: string }> } | null = null;
    const made = new Map<string, ReturnType<typeof build>>();
    let originalMarks = -1;

    function plan(author: string) {
        page ??= real<{ pages: { view: number[]; items: PdfWordItem[]; styles: Record<string, { fontFamily?: string }> }[] }>({ op: "pages", pdf: b64(original), pages: [0] }).pages[0];
        const pages = [page];
        const [{ view, items, styles }] = pages;
        const box = view as unknown as PageBox;
        const text = pageWordsOf(items, userSpaceGeometry(box), { styles });
        const start = text.text.indexOf("bold term");
        const quoted = quoteAt(text.text, start, text.text.indexOf("italic phrase") + "italic phrase".length)!;
        const thought = { id: "h1", at: 1, text: COMMENT, links: [], about: "Papers/formats.pdf", quote: quoted.quote, meaning: "question", locator: { at: 0, label: "p. 1" } } as unknown as Thought;
        const lines = placeHighlight(text, box, thought)!;
        const hole = holeFor(0, COMMENT, author)!;
        const [note] = placeNotes(box, text.words, ["A note in the margin, for the reader."]);
        // A pen stroke drawn in Page view, red, across the top of the page (#843).
        const pen = inkPayloads({ page: 0, place: { px: 0.2, py: 0.1 }, strokes: [{ colour: "red", pointerType: "mouse", points: [0, 1, 2, 3].map((i) => ({ x: i * 2, y: i % 2, p: 0.5, tilt: 0, t: i })) }] }, box, 0, author || undefined);
        const payloads = [highlightPayload(lines, 0, thought, hole.user), notePayload(note, 0, author || undefined), ...pen];
        const planned: PlannedMark[] = [
            { page: 0, subtype: "Highlight", contents: COMMENT, author },
            { page: 0, subtype: "FreeText", contents: note.lines.join("\n"), author },
            { page: 0, subtype: "Ink", contents: "", author },
        ];
        return { lines, hole, payloads, planned };
    }

    function make(author: string) {
        if (!made.has(author)) made.set(author, build(author));
        return made.get(author)!;
    }

    function build(author: string) {
        const { lines, hole, payloads, planned } = plan(author);
        const saved = new Uint8Array(Buffer.from(real<{ saved: string }>({ op: "save", pdf: b64(original), payloads: payloads.map(forJson) }).saved, "base64"));
        const missing = fillHoles(saved, [hole], original.length);
        const read = (bytes: Uint8Array) => new Map(Object.entries(real<{ pages: Record<string, ReadMark[]> }>({ op: "read", pdf: b64(bytes), pages: [0] }).pages).map(([k, v]) => [Number(k), v]));
        if (originalMarks < 0) originalMarks = read(original).get(0)!.length;
        const before = new Map([[0, originalMarks]]);
        return { lines, saved, missing, planned, before, after: read(saved), read };
    }

    it("places a passage on two lines as two quads over its words (AC-1)", () => {
        const { lines } = plan("Rafa");
        expect(lines.length).toBeGreaterThanOrEqual(1);
        for (const line of lines) {
            const [left, top, right, , , bottom] = line.quad;
            expect(right).toBeGreaterThan(left);
            expect(top).toBeGreaterThan(bottom);
            // On the page's first paragraph, set at y 704 in user space.
            expect(bottom).toBeLessThan(712);
            expect(top).toBeGreaterThan(700);
        }
    });

    it("carries the note as the highlight's comment and the author as its title, the original first (AC-3, AC-8)", () => {
        const { saved, missing, planned, before, after } = make("Rafa");
        expect(missing).toEqual([]);
        expect(startsWith(saved, original)).toBe(true);
        expect(checkCopy({ saved, original, missing, planned, before, after })).toBeNull();
        const highlight = after.get(0)!.find((mark) => mark.subtype === "Highlight")!;
        expect(highlight.contents).toBe(COMMENT);
        expect(highlight.title).toBe("Rafa");
    });

    it("writes no author when none is given (FR-6)", () => {
        const { saved, missing, planned, before, after } = make("");
        expect(checkCopy({ saved, original, missing, planned, before, after })).toBeNull();
        expect(after.get(0)!.find((mark) => mark.subtype === "Highlight")!.title).toBe("");
    });

    it("keeps what the PDF already had: its link, beside the new marks (AC-6)", () => {
        const { after, before } = make("Rafa");
        expect(before.get(0)).toBe(1);
        expect(after.get(0)!.map((mark) => mark.subtype).sort()).toEqual(["FreeText", "Highlight", "Ink", "Link"]);
    });

    it("carries your pen as ink, in its colour and with your name (#843 AC-1, AC-3)", () => {
        const { after } = make("Rafa");
        const ink = after.get(0)!.find((mark) => mark.subtype === "Ink") as ReadMark & { color: number[] };
        expect(ink.title).toBe("Rafa");
        // pdf.js keeps a colour as 0-1 floats: one channel may come back a unit off.
        [0xd9, 0x38, 0x3c].forEach((channel, i) => expect(Math.abs(ink.color[i] - channel)).toBeLessThanOrEqual(1));
    });

    it("says a corrupted comment does not read back, so nothing would be saved (AC-9)", () => {
        const { saved, missing, planned, before, read } = make("Rafa");
        const at = Buffer.from(saved).indexOf("/Contents <FEFF", original.length);
        saved[at + 20] = saved[at + 20] === 0x30 ? 0x31 : 0x30;
        expect(checkCopy({ saved, original, missing, planned, before, after: read(saved) })).toBe("contents");
    });
});

describe("the real pdf.js stays out of the plugin (#842)", () => {
    it("is imported by nothing under src/", () => {
        const offenders: string[] = [];
        const walk = (folder: string) => {
            for (const name of readdirSync(folder)) {
                const path = join(folder, name);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.(ts|tsx|js|mjs)$/.test(name) && readFileSync(path, "utf8").includes("pdfjs-dist")) offenders.push(path);
            }
        };
        walk(join(ROOT, "src"));
        expect(offenders).toEqual([]);
    });
});

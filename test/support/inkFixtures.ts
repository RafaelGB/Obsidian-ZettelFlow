import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { InkPoint } from "application/reader/ink/inkStroke";
import { isUnreadable, parseInkSvg, type InkDrawing } from "application/reader/ink/inkSvg";
import type { WordBox } from "application/reader/ink/inkAnchor";
import type { MarkBox } from "application/reader/ink/gestures";

/**
 * Ink to test against (#745 T6b): recorded drawings in `test/fixtures/ink/*.svg`, read through the
 * same `parseInkSvg` the Reader uses, and synthetic strokes shaped like handwriting. #746 and #747 add
 * their own classes of stroke to the same folder.
 */
const DIR = join(__dirname, "..", "fixtures", "ink");

export function fixtureNames(): string[] {
    return readdirSync(DIR)
        .filter((name) => name.endsWith(".svg"))
        .map((name) => name.replace(/\.svg$/, ""))
        .sort();
}

/** A recorded drawing by name (`write-01`), parsed. Throws when it cannot be read: a fixture must be. */
export function loadInk(name: string): InkDrawing {
    const drawing = parseInkSvg(readFileSync(join(DIR, `${name}.svg`), "utf8"));
    if (isUnreadable(drawing)) throw new Error(`fixture ${name} is unreadable`);
    return drawing;
}

/** A gesture fixture (#747): its strokes, and the words and marks it was drawn over — all in ems. */
export interface GestureFixture {
    name: string;
    strokes: { x: number; y: number }[][];
    words: WordBox[];
    marks: MarkBox[];
    gapMs?: number;
    /** Whether a context was saved beside it; #745's and #746's strokes have none. */
    context: boolean;
}

/**
 * A recorded stroke with its context: `name.json` beside `name.svg` holds the words and marks under it.
 * A stroke recorded without one (#745, #746) is judged over the worst page there is: words everywhere
 * under it, so a loop that could hold a word does.
 */
export function loadGesture(name: string): GestureFixture {
    const strokes = loadInk(name).strokes.map((stroke) => stroke.points.map((p) => ({ x: p.x, y: p.y })));
    const path = join(DIR, `${name}.json`);
    if (existsSync(path)) {
        const context = JSON.parse(readFileSync(path, "utf8")) as { words: WordBox[]; marks: MarkBox[]; gapMs?: number };
        return { name, strokes, words: context.words, marks: context.marks, ...(context.gapMs !== undefined ? { gapMs: context.gapMs } : {}), context: true };
    }
    return { name, strokes, words: wordsUnder(strokes.flat()), marks: [], context: false };
}

/** Words on every line under some points, 1.5 em apart, from two lines above to two below. */
function wordsUnder(points: { x: number; y: number }[]): WordBox[] {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const words: WordBox[] = [];
    let at = 0;
    for (let top = Math.min(...ys) - 3; top < Math.max(...ys) + 3; top += 1.5) {
        for (let x = Math.min(...xs) - 4, i = 0; x < Math.max(...xs) + 4; i++) {
            const width = 1 + ((i * 7) % 5) * 0.5;
            words.push({ start: at, end: at + width * 2, left: x, top, width, height: 1 });
            at += width * 2 + 1;
            x += width + 0.3;
        }
    }
    return words;
}

/** A loop of `n` points, a cursive `l` drawn at `x0`, with pressure that swells and fades. */
function loop(x0: number, n: number, t0: number): InkPoint[] {
    return Array.from({ length: n }, (_, i) => {
        const k = i / (n - 1);
        return {
            x: x0 + 14 * k + 6 * Math.sin(k * Math.PI * 2),
            y: 40 - 30 * Math.sin(k * Math.PI),
            p: 0.3 + 0.5 * Math.sin(k * Math.PI),
            tilt: 0.9 + 0.4 * k,
            t: t0 + i * 6,
        };
    });
}

/** Strokes shaped like handwriting, in px: a word, a long sentence's scrawl, an arrow, a hard press. */
export function synthetic(): { name: string; points: InkPoint[] }[] {
    const scrawl: InkPoint[] = Array.from({ length: 400 }, (_, i) => ({
        x: i * 1.7,
        y: 20 + 9 * Math.sin(i / 3) + 4 * Math.sin(i / 11),
        p: 0.5 + 0.3 * Math.sin(i / 17),
        tilt: Math.PI / 2 - 0.3,
        t: i * 5,
    }));
    const arrow: InkPoint[] = [
        ...Array.from({ length: 30 }, (_, i) => ({ x: i * 4, y: 50 - i * 0.4, p: 0.5, tilt: Math.PI / 2, t: i * 8 })),
        ...Array.from({ length: 10 }, (_, i) => ({ x: 120 - i * 2, y: 38 - i * 2, p: 0.5, tilt: Math.PI / 2, t: 240 + i * 8 })),
    ];
    const hard: InkPoint[] = Array.from({ length: 60 }, (_, i) => ({ x: i * 3, y: 10 + (i % 7), p: 0.95, tilt: 0.4, t: i * 4 }));
    return [
        { name: "word", points: [...loop(0, 24, 0), ...loop(20, 24, 150)] },
        { name: "scrawl", points: scrawl },
        { name: "arrow", points: arrow },
        { name: "hard", points: hard },
    ];
}

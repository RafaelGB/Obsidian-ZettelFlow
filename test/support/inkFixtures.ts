import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { InkPoint } from "application/reader/ink/inkStroke";
import { isUnreadable, parseInkSvg, type InkDrawing } from "application/reader/ink/inkSvg";

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

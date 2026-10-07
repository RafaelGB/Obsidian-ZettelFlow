import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..", "..", "src");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/** A frame asked of the main window — spelled bare, as `window.` or as `activeWindow.`. */
const MAIN_WINDOW_FRAME = /(?:^|[^.\w])(?:window\.|activeWindow\.)?(?:request|cancel)AnimationFrame\(/m;

/**
 * Frames come from the element's own window.
 *
 * Settings open in a window of their own (Obsidian 1.14), and so can a modal or a view in a popout.
 * The main window's requestAnimationFrame never fires while that window is hidden behind it: the
 * settings section bar stopped following the scroll and a click on it did not light up. Ask the
 * element instead — `el.win.requestAnimationFrame`.
 */
describe("animation frames come from the element's window", () => {
    const files = sources(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }));

    it("reads the whole of src", () => {
        expect(files.length).toBeGreaterThan(400);
    });

    it("has no frame asked of the main window", () => {
        expect(files.filter(({ text }) => MAIN_WINDOW_FRAME.test(text)).map(({ path }) => path)).toEqual([]);
    });

    it("still asks for frames through an element, or the rule would be vacuous", () => {
        expect(files.filter(({ text }) => /\.win\.requestAnimationFrame\(/.test(text)).length).toBeGreaterThanOrEqual(2);
    });
});

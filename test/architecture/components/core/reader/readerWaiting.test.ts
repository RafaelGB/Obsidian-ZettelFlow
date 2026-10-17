import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../../../../support/dashboardDom";
import { armChapterWait } from "architecture/components/core/reader/readerWaiting";
import { OPENING_MS } from "architecture/components/core/reader/readerLookup";

const SCSS = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "styles", "components", "reader.scss"), "utf8");

/** A reader's root and its stage, with a chapter body in it. */
function reader() {
    const root = new DomNode();
    const stage = root.createDiv({ cls: "zettelkasten-flow__reader-stage" });
    const body = stage.createEl("article").createDiv({ cls: "zettelkasten-flow__reader-source-body" });
    return { root, stage, body };
}

const waits = (root: DomNode) => root.byClass("reader-chapter-wait");
/** The rule that draws the wait (not the reduced-motion one, which comes first in the file). */
const waitRule = () => /\.zettelkasten-flow__reader-chapter-wait \{(?=[^}]*display: flex)([^}]*)\}/.exec(SCSS)?.[1] ?? "";

/**
 * A chapter slow to open says so, and a fast one never does (#825 AC-M1).
 *
 * The wait is laid over the page **at once**, invisible, and fades in after the delay by CSS — on
 * the compositor. A timer could not do it: drawing a chapter holds the main thread, and on a slow
 * device a 150 ms timer fired after 1.6 s, over an empty page (#825 T11, a 20× CPU throttle).
 */
describe("waiting for a chapter (#825)", () => {
    it("lays the wait over the page at once, said for a screen reader, the pen about to write", () => {
        const { root, stage } = reader();
        armChapterWait(root as never, stage as never, "Opening the chapter…");
        const [wait] = waits(root);
        expect(wait.getAttribute("role")).toBe("status");
        expect(wait.byClass("visually-hidden")[0].textContent).toBe("Opening the chapter…");
        expect(wait.byClass("reader-ink-wait")[0].children).toHaveLength(3);
    });

    it("waits the Reader's one delay before it shows — the same number as the look-up's", () => {
        const { root, stage } = reader();
        armChapterWait(root as never, stage as never, "Opening the chapter…");
        expect(waits(root)[0].cssProps["--zf-wait-delay"]).toBe(`${OPENING_MS}ms`);
        expect(waitRule()).toMatch(/animation: zf-reader-chapter-wait-in \S+ \S+ var\(--zf-wait-delay\) both;/);
    });

    it("is gone the moment the chapter is drawn, so a fast open never shows it", () => {
        const { root, stage } = reader();
        const disarm = armChapterWait(root as never, stage as never, "Opening the chapter…");
        disarm();
        disarm();
        expect(waits(root)).toHaveLength(0);
    });

    it("lies over the stage beside it, never inside the chapter's body", () => {
        const { root, stage, body } = reader();
        armChapterWait(root as never, stage as never, "Opening the chapter…");
        const [wait] = waits(root);
        expect(wait.parent).toBe(root);
        expect(stage.nextElementSibling).toBe(wait);
        expect(body.byClass("reader-chapter-wait")).toHaveLength(0);
    });

    it("fades in on opacity alone, and under reduced motion appears at once after the same delay", () => {
        const keyframes = /@keyframes zf-reader-chapter-wait-in \{([\s\S]*?)\n\}/.exec(SCSS)?.[1] ?? "";
        expect(keyframes).toContain("opacity");
        expect(keyframes).not.toMatch(/transform|translate|scale/);
        const reduced = SCSS.slice(SCSS.indexOf("@media (prefers-reduced-motion: reduce)", SCSS.indexOf("zf-reader-chapter-wait-in")));
        // No fade, and still the delay: a fast open must not flash the pen with motion off either.
        expect(reduced).toMatch(/\.zettelkasten-flow__reader-chapter-wait \{\s*animation-duration: 1ms;\s*\}/);
    });
});

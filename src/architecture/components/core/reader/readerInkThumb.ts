import { c } from "architecture";
import { mergedPaths, segmentsOf } from "application/reader/ink/inkStroke";
import { drawingBox, isUnreadable, parseInkSvg, type InkDrawing } from "application/reader/ink/inkSvg";

/**
 * **A small rendering of an ink note** (#745 E9): the margin's list, Think's card and the book
 * notebook show the handwriting itself. Drawn from the points with `createSvg` — the file's own SVG
 * is never inserted as markup — in the theme's colour for each ink (§XV). Returns the drawing it drew,
 * or `null` when there was nothing it could read.
 */
export function renderInkThumb(parent: HTMLElement, source: string | InkDrawing): InkDrawing | null {
    const drawing = typeof source === "string" ? parseInkSvg(source) : source;
    if (isUnreadable(drawing) || drawing.strokes.length === 0) return null;
    const box = drawingBox(drawing);
    const width = Math.max(0.01, box.right - box.left);
    const height = Math.max(0.01, box.bottom - box.top);
    const svg = parent.createSvg("svg", {
        cls: [c("reader-ink-thumb")],
        attr: { viewBox: `${box.left} ${box.top} ${width} ${height}`, "aria-hidden": "true", preserveAspectRatio: "xMinYMid meet" },
    });
    for (const stroke of drawing.strokes) {
        const g = svg.createSvg("g", { cls: [c("reader-ink-stroke"), c(`reader-ink--${stroke.colour}`)] });
        for (const path of mergedPaths(segmentsOf(stroke.points, stroke.pointerType))) {
            g.createSvg("path", { attr: { d: path.d, "stroke-width": String(path.w) } });
        }
    }
    return drawing;
}

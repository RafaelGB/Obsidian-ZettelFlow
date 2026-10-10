import { inkImageLayout } from "application/reader/ink/inkReading";
import type { InkDrawing } from "application/reader/ink/inkSvg";
import type { AiImage } from "architecture/ai/AiProvider";

/**
 * **The strokes of one ink note, alone, as an image** (#748 FR-3): what is sent to read handwriting.
 *
 * Drawn from the drawing's own points — never a screenshot of the page — dark on plain light, with no
 * page, no other mark and no theme: the signature takes one drawing, so nothing else can be in it.
 * The colours here are pixels for a model to read, not a stylesheet (§XV governs stylesheets).
 *
 * The canvas is made on `at`'s document (a pop-out's own), and thrown away once read. `null` when
 * there is no 2D context to draw with.
 */
export function inkImage(drawing: InkDrawing, at: HTMLElement): AiImage | null {
    const layout = inkImageLayout(drawing);
    const canvas = at.createEl("canvas", { attr: { width: layout.width, height: layout.height } });
    canvas.remove();
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const x = (em: number) => (em - layout.left) * layout.scale;
    const y = (em: number) => (em - layout.top) * layout.scale;
    for (const stroke of layout.segments) {
        for (const seg of stroke) {
            ctx.lineWidth = Math.max(1, seg.w * layout.scale);
            ctx.beginPath();
            ctx.moveTo(x(seg.from[0]), y(seg.from[1]));
            if (seg.c) ctx.quadraticCurveTo(x(seg.c[0]), y(seg.c[1]), x(seg.to[0]), y(seg.to[1]));
            else ctx.lineTo(x(seg.to[0]), y(seg.to[1]));
            ctx.stroke();
        }
    }
    const url = canvas.toDataURL("image/png");
    const base64 = url.slice(url.indexOf(",") + 1);
    return base64 ? { mime: "image/png", base64 } : null;
}

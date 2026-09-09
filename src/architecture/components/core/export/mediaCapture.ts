// Canvas capture for the export util (A3, #386): a still PNG and a short WebM clip. Manual-verify
// (jsdom has no WebGL / MediaRecorder); kept graph-agnostic so B4 (#387) can reuse it.

/**
 * Read the canvas as a PNG blob. `render` is injected so the caller can synchronously re-render the
 * WebGL scene first — three.js clears the drawing buffer after each frame, so a naive read can be blank.
 */
export async function canvasToPngBlob(canvas: HTMLCanvasElement, render?: () => void): Promise<Blob> {
    render?.();
    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
            "image/png"
        );
    });
}

/** The best-supported WebM MIME type for `MediaRecorder`, or `null` when the device cannot record. */
export function pickVideoMimeType(): string | null {
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const Rec = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
    if (!Rec || typeof Rec.isTypeSupported !== "function") return null;
    for (const type of candidates) if (Rec.isTypeSupported(type)) return type;
    return null;
}

export interface RecordOptions {
    durationMs: number;
    mimeType: string;
    /** Called once the recorder is live, so the caller can start the animation being captured. */
    onStart?: () => void;
    /** Exposes the recorder so the caller can stop it on teardown. */
    onRecorder?: (recorder: MediaRecorder) => void;
}

/** Record the canvas to a WebM blob for `durationMs` via `captureStream` + `MediaRecorder`. */
export async function recordCanvasWebm(canvas: HTMLCanvasElement, opts: RecordOptions): Promise<Blob> {
    const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: opts.mimeType });
    opts.onRecorder?.(recorder);
    const chunks: Blob[] = [];
    return await new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error("MediaRecorder error"));
        recorder.onstop = () => resolve(new Blob(chunks, { type: opts.mimeType }));
        recorder.start();
        opts.onStart?.();
        window.setTimeout(() => {
            if (recorder.state !== "inactive") recorder.stop();
        }, opts.durationMs);
    });
}

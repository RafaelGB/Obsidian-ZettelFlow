import ZettelFlow from "main";
import { FileService } from "architecture/plugin";
import { buildTemplate, ZfTemplate } from "application/template/zfTemplate";

export interface ActiveCanvasTemplate {
    name: string;
    template: ZfTemplate;
    json: string;
}

/**
 * Build a `.zftemplate` bundle from the currently active canvas (or the ribbon canvas), so the user
 * can share it to the community via GitHub (#294 S3). Returns `null` when no canvas is available.
 * Mirrors the `export-canvas-template` command's logic so the two stay in sync.
 */
export async function buildActiveCanvasTemplate(plugin: ZettelFlow): Promise<ActiveCanvasTemplate | null> {
    const activeFile = plugin.app.workspace.getActiveFile();
    let canvasPath: string | undefined;
    if (activeFile?.extension === "canvas") {
        canvasPath = activeFile.path;
    } else if (plugin.settings.ribbonCanvas) {
        canvasPath = plugin.settings.ribbonCanvas;
    }
    if (!canvasPath) return null;

    const canvasFile = await FileService.getFile(canvasPath, false);
    if (!canvasFile) return null;

    const canvasContent = await FileService.getContent(canvasFile);
    const steps: Array<{ filename: string; content: string }> = [];
    try {
        const canvasData = JSON.parse(canvasContent) as { nodes?: Array<{ type?: string; file?: string }> };
        for (const node of canvasData.nodes ?? []) {
            if (node.type === "file" && node.file?.endsWith(".md")) {
                const stepFile = await FileService.getFile(node.file, false);
                if (stepFile) {
                    steps.push({ filename: stepFile.name, content: await FileService.getContent(stepFile) });
                }
            }
        }
    } catch {
        // Canvas parse error — build with no steps.
    }

    const name = canvasFile.basename;
    const template = buildTemplate(name, "", "", { filename: canvasFile.name, content: canvasContent }, steps);
    return { name, template, json: JSON.stringify(template, null, 2) };
}

/** Trigger a browser download of a `.zftemplate` file — the large-payload fallback for sharing. */
export function downloadTemplate(name: string, json: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // Detached on purpose: the global createEl builds a parentless element, unlike
    // activeDocument.createEl, which appends to the document and throws.
    const anchor = createEl("a", { href: url });
    anchor.setAttr("download", `${name}.zftemplate`);
    anchor.click();
    URL.revokeObjectURL(url);
}

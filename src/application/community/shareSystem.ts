import { FileService } from "architecture/plugin/services/FileService";
import { t } from "architecture/lang";
import { buildTemplate, ZfTemplate } from "application/template/zfTemplate";
import { MAX_PREFILL_URL, newIssueUrl } from "./githubContribute";

export interface CanvasTemplate {
    name: string;
    template: ZfTemplate;
    json: string;
}

/**
 * Build a `.zftemplate` bundle from one canvas, so it can be shared to the community through GitHub
 * (#294 S3, #803). The canvas and every note a file node points at travel; nothing else does.
 * Returns `null` when there is no such canvas.
 */
export async function buildCanvasTemplate(canvasPath: string): Promise<CanvasTemplate | null> {
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

/** Where the share candidate comes from (#803 FR-2). */
export interface ShareSources {
    /** The canvas most recently focused in this window, as the Community view tracked it. */
    focused: string | null;
    /** The creation flow (`ribbonCanvas`): today's fallback. */
    ribbon: string | undefined;
}

/**
 * **Which canvas would be shared** (#803 FR-2, FR-3) — pure. The canvas you last had in front of you
 * in this window, else the creation flow, else none. While Community is the active tab Obsidian's
 * active file is `null`, which is why the view tracks the focused canvas itself.
 */
export function shareCandidate(sources: ShareSources, exists: (path: string) => boolean): string | null {
    for (const path of [sources.focused, sources.ribbon]) {
        if (path && path.endsWith(".canvas") && exists(path)) return path;
    }
    return null;
}

/** What sharing does: open the prefilled form, or download the file and open the form with a hint. */
export type ShareFlow = { open: string } | { download: { name: string; json: string }; open: string };

/**
 * **Today's share flow, as data** (#294 S3, moved out of the old Contribute panel by #803 AC-2):
 * the GitHub issue form prefilled with the system's JSON when the URL fits, otherwise a download of
 * the `.zftemplate` and the form with a hint to paste it.
 */
export function shareFlow(built: Pick<CanvasTemplate, "name" | "json">): ShareFlow {
    const inlineUrl = newIssueUrl("ADD_TEMPLATE.yaml", {
        "template-type": "System",
        description: t("community_contribute_share_prefill_desc", built.name),
        "json-template": built.json,
    });
    if (inlineUrl.length <= MAX_PREFILL_URL) return { open: inlineUrl };
    return {
        download: { name: built.name, json: built.json },
        open: newIssueUrl("ADD_TEMPLATE.yaml", {
            "template-type": "System",
            description: t("community_contribute_share_paste_hint"),
        }),
    };
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

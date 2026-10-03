import type { App } from "obsidian";
import { log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import { buildIdeaCard, trajectory, type TimelineEvent } from "architecture/knowledge/state";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { paintIdeaCard } from "architecture/components/core/timeline/IdeaCardCanvas";
import { canvasToPngBlob } from "architecture/components/core/export/mediaCapture";
import { buildExportBaseName } from "architecture/components/core/export/exportFilename";
import { ExportShareModal } from "architecture/components/core/export/ExportShareModal";

/**
 * Build the before→after idea card for a note and open A3's export dialog (#387, B4) — moved from
 * the evolution timeline into the companion's ⋯ menu (#642). Read-only: composes shipped data
 * (timeline + judgements + current degree) into a canvas image; writes nothing to the note or the
 * vault until the user chooses to save from the dialog.
 */
export async function shareIdeaCard(app: App, path: string, events: readonly TimelineEvent[]): Promise<void> {
    try {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") return;
        const model = index.getModel();
        const linksNow = model.get(path)?.maturitySignals.degree ?? 0;
        const history = JudgementLog.getInstance().entries();
        const direction = trajectory(model, history, Date.now()).find((row) => row.path === path)?.direction ?? null;

        const card = buildIdeaCard({ path, events: [...events], linksNow, direction });
        if (!card) return;

        const canvas = createEl("canvas");
        paintIdeaCard(canvas, card);
        const blob = await canvasToPngBlob(canvas);
        new ExportShareModal(app, { blob, baseName: buildExportBaseName("idea", new Date(), card.title), kind: "image" }).open();
    } catch (error) {
        log.error(`[NoteStory] share failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
}

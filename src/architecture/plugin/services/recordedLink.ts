import { TFile, type App } from "obsidian";
import { CultivationService } from "./CultivationService";
import { currentWriteBatch, withWriteBatch, writeBatchActive } from "architecture/plugin/writes/recordVaultWrite";

/** A write that was made — and, when it is safe to offer, the batch that takes it back. */
export interface LinkResult {
    ok: boolean;
    batch?: string;
}

/**
 * Run one click's write in a batch of its own, attributed to you (#640, #641).
 *
 * The batch is only returned when it is the click's alone. Batches are module-wide, so a click that
 * lands while a hook or a flow is mid-write would join that batch, and an undo offered for it would
 * take the other writes back too. Then the change is still made and recorded; it just offers no
 * one-click undo.
 */
export async function inOwnBatch(ref: string, label: string, op: () => Promise<boolean>): Promise<LinkResult> {
    const shared = writeBatchActive();
    let batch: string | undefined;
    const ok = await withWriteBatch({ kind: "manual", ref, label }, async () => {
        batch = currentWriteBatch();
        return op();
    });
    if (!ok) return { ok: false };
    return shared ? { ok } : { ok, batch };
}

/** Obsidian's own link text from one note to another, so two notes with the same name are not confused. */
export function linkTextFor(app: App, intoPath: string, targetPath: string): string {
    const target = app.vault.getAbstractFileByPath(targetPath);
    return target instanceof TFile
        ? app.metadataCache.fileToLinktext(target, intoPath, true)
        : (targetPath.split("/").pop() ?? targetPath).replace(/\.md$/i, "");
}

/**
 * Link one note to another, **into the note you named** (#640 amendment 2).
 *
 * Not the active editor: in a sidebar the active leaf is the sidebar, and a pinned companion is
 * about a note you may not be looking at. The write goes through Cultivate's append, into the
 * write record, and raises no toast — the caller answers inline.
 */
export async function linkNotes(app: App, intoPath: string, targetPath: string): Promise<LinkResult> {
    const text = linkTextFor(app, intoPath, targetPath);
    return inOwnBatch("note-link", intoPath, () =>
        CultivationService.getInstance().link(app, intoPath, text, { quiet: true })
    );
}

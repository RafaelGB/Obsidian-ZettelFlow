import { TFile, type App } from "obsidian";
import { CultivationService } from "./CultivationService";
import { currentWriteBatch, withWriteBatch, writeBatchActive } from "architecture/plugin/writes/recordVaultWrite";

/** A link that was written — and, when it is safe to offer, the batch that takes it back. */
export interface LinkResult {
    ok: boolean;
    batch?: string;
}

/**
 * Link one note to another, **into the note you named** (#640 amendment 2).
 *
 * Not the active editor: in a sidebar the active leaf is the sidebar, and a pinned companion is
 * about a note you may not be looking at. The link text is Obsidian's own for that pair of files
 * (`fileToLinktext`), so two notes with the same name are not confused. The write goes through
 * Cultivate's append, into the write record, and raises no toast — the caller answers inline.
 *
 * The batch is only returned when it is the link's alone. Batches are module-wide, so a click that
 * lands while a hook or a flow is mid-write would join that batch, and an undo offered for it would
 * take the other writes back too. Then the link is still written and recorded; it just offers no
 * one-click undo.
 */
export async function linkNotes(app: App, intoPath: string, targetPath: string): Promise<LinkResult> {
    const target = app.vault.getAbstractFileByPath(targetPath);
    const text =
        target instanceof TFile
            ? app.metadataCache.fileToLinktext(target, intoPath, true)
            : (targetPath.split("/").pop() ?? targetPath).replace(/\.md$/i, "");
    const shared = writeBatchActive();
    let batch: string | undefined;
    const ok = await withWriteBatch({ kind: "manual", ref: "note-link", label: intoPath }, async () => {
        batch = currentWriteBatch();
        return CultivationService.getInstance().link(app, intoPath, text, { quiet: true });
    });
    if (!ok) return { ok: false };
    return shared ? { ok } : { ok, batch };
}

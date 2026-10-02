import type { App } from "obsidian";
import { CultivationService } from "./CultivationService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";

/** A link that was written — and the batch that takes it back. */
export interface LinkResult {
    ok: boolean;
    batch?: string;
}

/**
 * Link one note to another, **into the note you named** (#640 amendment 2).
 *
 * Not the active editor: in a sidebar the active leaf is the sidebar, and a pinned companion is
 * about a note you may not be looking at. The write goes through Cultivate's append, so it lands in
 * the write record in a batch of its own and can be taken back exactly with `undoBatch`. It raises
 * no toast — the caller says what happened, inline, next to its undo.
 */
export async function linkNotes(app: App, intoPath: string, targetName: string): Promise<LinkResult> {
    let batch: string | undefined;
    const ok = await withWriteBatch({ kind: "manual", ref: "note-link", label: intoPath }, async () => {
        batch = currentWriteBatch();
        return CultivationService.getInstance().link(app, intoPath, targetName, { quiet: true });
    });
    return ok ? { ok, batch } : { ok: false };
}

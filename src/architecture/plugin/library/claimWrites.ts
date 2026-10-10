import type { Vault } from "obsidian";
import { FileService } from "architecture/plugin/services/FileService";

/** What a claim's create comes back as (#762): made, a name already taken, or not written. */
export type ClaimCreateOutcome = "created" | "taken" | "failed";

/**
 * **The one writer of a claim note** (#762 FR-3): a new note, create-only, through FileService's
 * create-once seam — so it is in the write record (*Recent*, undo) and a taken path is never
 * overwritten. A folder that is not there yet is made first. The book is never written: the path is
 * always a markdown note, decided by the sheet.
 */
export async function createClaimNote(vault: Vault, path: string, content: string): Promise<ClaimCreateOutcome> {
    if (!path.endsWith(".md")) return "failed";
    const outcome = await FileService.createFilesOnce(vault, [{ path, content }]);
    return outcome === "complete" ? "created" : outcome === "conflict" ? "taken" : "failed";
}

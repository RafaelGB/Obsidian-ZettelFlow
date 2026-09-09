import { TFile } from "obsidian";
import { ObsidianApi, log } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { mimeToExtension, resolveAvailablePath } from "./exportFilename";

/**
 * Save a captured blob into the vault through the **Vault facade** (never the Adapter, never global
 * `app`). The parent folder is the user's configured attachment folder (asked via `fileManager`); the
 * file name dedupes against existing files. Returns the created `TFile`. Reused by A3 and B4 (#387).
 */
export async function saveExportToVault(blob: Blob, baseName: string): Promise<TFile> {
    const ext = mimeToExtension(blob.type);
    // Ask Obsidian where attachments belong (respects the user's setting), then take its parent folder.
    const probe = await ObsidianApi.fileManager().getAvailablePathForAttachment(`${baseName}.${ext}`);
    const folder = probe.includes("/") ? probe.slice(0, probe.lastIndexOf("/")) : "";
    const path = resolveAvailablePath(folder, baseName, ext, (p) => ObsidianApi.vault().getAbstractFileByPath(p) != null);
    const buffer = await blob.arrayBuffer();
    const file = await FileService.writeBinaryFile(path, buffer);
    log.info(`[export] saved ${path}`);
    return file;
}

import { v4 as uuid4 } from "uuid";
import { log } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { flowFolders } from "architecture/plugin/canvas/flowRole";
import type { ZfTemplate } from "application/template/zfTemplate";
import type ZettelFlow from "main";
import { REGISTERED_ACTION_IDS, planSystemInstall, validateSystemTemplate } from "./systemInstall";
import { installDestination, type InstallRole } from "./installDestination";
import { addInstall, canonicalHash, type InstalledSystem } from "./installRecord";

/**
 * **Install a system, without a dialog** (#799 FR-12, epic #797).
 *
 * The install used to be a third modal: a confirmation that repeated what you had already chosen.
 * The panel now says the consequence before you press anything, so pressing Install *is* the
 * agreement. This is the write half, moved out of the old system modal so the room — and S6's
 * Installed — share one path.
 *
 * In order, and only in this order: the template is validated, the role is planned (a problem
 * there writes nothing), every file is created in **one write batch** (#453) through
 * `FileService.createFilesOnce`, then — only now that the files exist — the role's one setting, and
 * the install record. Every outcome comes back tagged, so the panel says it inline.
 */

export interface InstallChoice {
    role: InstallRole;
    /** Where the files go when the role does not decide it. */
    targetFolder: string;
    /** For the folder role: the vault folder whose new notes should run it. */
    folder?: string;
}

export type InstallOutcome =
    | { kind: "invalid"; problems: string[] }
    | { kind: "role-problem"; problem: "folder-required" | "no-home" }
    | { kind: "conflict" | "partial" | "failed" }
    | { kind: "installed"; record: InstalledSystem; canvasPath: string };

type InstallVault = ZettelFlow["app"]["vault"];

/** Every folder on the way to these files that does not exist yet, shallowest first. */
function foldersToCreate(vault: InstallVault, paths: string[]): string[] {
    const missing: string[] = [];
    for (const path of paths) {
        const parts = path.split("/").slice(0, -1);
        for (let i = 1; i <= parts.length; i++) {
            const folder = parts.slice(0, i).join("/");
            if (!missing.includes(folder) && !vault.getAbstractFileByPath(folder)) missing.push(folder);
        }
    }
    return missing;
}

export async function installSystem(
    plugin: ZettelFlow,
    template: ZfTemplate,
    ref: string,
    choice: InstallChoice
): Promise<InstallOutcome> {
    const problems = validateSystemTemplate(template, REGISTERED_ACTION_IDS);
    if (problems.length > 0) {
        log.error("Refusing to install an invalid community system:", problems);
        return { kind: "invalid", problems };
    }
    const destination = installDestination({
        role: choice.role,
        targetFolder: choice.targetFolder,
        canvasFilename: template.canvas.filename,
        folders: flowFolders(plugin.settings),
        folder: choice.folder,
    });
    if (destination.problem) return { kind: "role-problem", problem: destination.problem };

    try {
        const { files } = planSystemInstall(template, destination.targetFolder);
        // A folder flow is found by its name, so the convention renames the canvas (#437).
        if (destination.canvasName && files.length > 0) {
            files[0] = { ...files[0], path: `${destination.targetFolder}/${destination.canvasName}` };
        }
        const vault = plugin.app.vault;
        const folders = foldersToCreate(vault, files.map((file) => file.path));
        let batch: string | undefined;
        const result = await withWriteBatch({ kind: "install", ref: template.name, label: template.name }, () => {
            batch = currentWriteBatch();
            return FileService.createFilesOnce(vault, files);
        });
        if (result !== "complete") return { kind: result };

        const canvasPath = files[0].path;
        // The role's one setting, written only now that its files exist.
        let setting: InstalledSystem["setting"];
        if (destination.settings) {
            const { key, value } = destination.settings;
            setting = { key, previous: plugin.settings[key] ?? "", value };
            plugin.settings[key] = value;
        }
        const record: InstalledSystem = {
            id: uuid4(),
            ref,
            name: template.name,
            at: Date.now(),
            folder: destination.targetFolder,
            canvas: canvasPath,
            role: choice.role,
            ...(setting ? { setting } : {}),
            files: files.map((file) => ({ path: file.path, hash: canonicalHash(file.path, file.content), size: file.content.length })),
            folders,
            ...(batch ? { batch } : {}),
        };
        plugin.settings.installedSystems = addInstall(plugin.settings.installedSystems, record);
        await plugin.saveSettings();
        return { kind: "installed", record, canvasPath };
    } catch (error) {
        log.error("Community system installation failed", error);
        return { kind: "failed" };
    }
}

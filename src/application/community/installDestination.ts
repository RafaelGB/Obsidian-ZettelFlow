import { canvasPathFromFolder } from "hooks/utils/PathUtils";
import type { FlowFolders, FlowRole } from "architecture/plugin/canvas/flowRole";

/**
 * Where an installed system lands, and what it changes (#437, epic #434) — pure.
 *
 * Installing used to write the files, open the canvas and offer a command: the system was in the
 * vault and connected to nothing. Adoption died at the last metre, every time.
 *
 * A system is now installed **into a role** (#435), and the role decides the destination folder and
 * the one setting it writes — computed here so the dialog can *show* it (including which canvas
 * stops being the one the ribbon opens) before a single file exists.
 */

/** What an install can be used for; `none` is today's behaviour, kept as the escape hatch. */
export type InstallRole = Extract<FlowRole, "create" | "edit" | "folder" | "event"> | "none";

export interface InstallDestinationInput {
    role: InstallRole;
    /** Where the files go when the role does not decide it (the *just the files* case). */
    targetFolder: string;
    /** The canvas filename inside the template, e.g. `Weekly focus.canvas`. */
    canvasFilename: string;
    folders: FlowFolders;
    /** For the folder role: the vault folder whose notes should run it. */
    folder?: string;
}

export interface InstallDestination {
    /** The folder `planSystemInstall` writes into. */
    targetFolder: string;
    /**
     * The canvas' final name, when the role renames it. A folder flow is found **by its name**, so
     * the convention decides it rather than the template's author.
     */
    canvasName?: string;
    /** The setting the role writes, once the files exist. */
    settings?: { key: "ribbonCanvas" | "editorCanvas"; value: string };
    /** The canvas that stops holding the role. It keeps existing as a file. */
    displaces?: string;
    /** Why this cannot be planned yet. */
    problem?: "folder-required" | "no-home";
}

function joinPath(folder: string, name: string): string {
    return folder === "/" || folder === "" ? name : `${folder}/${name}`;
}

export function installDestination({
    role,
    targetFolder,
    canvasFilename,
    folders,
    folder,
}: InstallDestinationInput): InstallDestination {
    if (role === "create" || role === "edit") {
        const key = role === "create" ? "ribbonCanvas" : "editorCanvas";
        const held = folders[key];
        const path = joinPath(targetFolder, canvasFilename);
        return {
            targetFolder,
            settings: { key, value: path },
            ...(held ? { displaces: held } : {}),
        };
    }

    if (role === "folder") {
        const home = folders.foldersFlowsPath;
        if (!home) return { targetFolder, problem: "no-home" };
        if (!folder?.trim()) return { targetFolder, problem: "folder-required" };
        // `canvasPathFromFolder` is the convention the folder automation already reads.
        const path = canvasPathFromFolder(home, folder.trim());
        const name = path.split("/").pop() as string;
        return { targetFolder: home, canvasName: name };
    }

    if (role === "event") {
        const home = folders.eventFlowsPath;
        if (!home) return { targetFolder, problem: "no-home" };
        return { targetFolder: home };
    }

    // Just the files: byte-for-byte what installing did before roles existed.
    return { targetFolder };
}

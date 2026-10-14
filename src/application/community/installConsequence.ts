import type { InstallDestination, InstallRole } from "./installDestination";

/**
 * **The consequence, said before anything is written** (#799 FR-10, epic #797) — pure.
 *
 * The confirmation dialog used to carry this, after you had pressed Install. The dialog is gone:
 * the panel says it **live**, one sentence rewritten on every change of role or folder, so the button
 * is pressed knowing exactly what it does — what is created and where, how it will run, what it
 * displaces, and that the notice afterwards can take it all back.
 *
 * Returned as locale keys and arguments, so this module stays Obsidian-free and the panel turns it
 * into words with `t` / `tCount`.
 */

export interface ConsequencePart {
    key: string;
    args: string[];
    /** Present when the part is a count, read with `tCount`. */
    count?: number;
}

export interface ConsequenceInput {
    role: InstallRole;
    destination: InstallDestination;
    /** Every file the install writes, the canvas included. */
    fileCount: number;
    /** The canvas filename inside the template; a folder role renames it. */
    canvasFilename: string;
}

/** How the system runs afterwards, said in the user's terms (#437). Literal keys for the guardrail. */
export const RUNS_KEY: Record<InstallRole, string> = {
    create: "community_system_runs_create",
    edit: "community_system_runs_edit",
    folder: "community_system_runs_folder",
    event: "community_system_runs_event",
    none: "community_system_runs_none",
};

export function consequence({ role, destination, fileCount, canvasFilename }: ConsequenceInput): ConsequencePart[] {
    if (destination.problem) return [];
    const folder = destination.targetFolder;
    const parts: ConsequencePart[] = [
        folder && folder !== "/"
            ? { key: "community_consequence_creates", args: [destination.canvasName ?? canvasFilename, String(fileCount), folder], count: fileCount }
            : { key: "community_consequence_creates_root", args: [destination.canvasName ?? canvasFilename, String(fileCount)], count: fileCount },
        { key: RUNS_KEY[role], args: [] },
    ];
    if (destination.displaces) parts.push({ key: "community_consequence_displaces", args: [destination.displaces] });
    parts.push({ key: "community_consequence_undo", args: [] });
    return parts;
}

import { canvasPathFromFolder } from "hooks/utils/PathUtils";
import { flowRole, isExclusive, type FlowFolders, type FlowRole } from "architecture/plugin/canvas/flowRole";

/**
 * What giving a canvas a role would do (#435, epic #434) — pure.
 *
 * A role is not a field you set: *create* and *edit* are one settings value each and displace
 * whoever held them, and *folder* and *event* are places, so taking one **moves a file**. Both are
 * writes someone has to agree to, which means they have to be shown first — and showing them
 * means computing them without doing them.
 *
 * The install dialog (#437) plans the same change for a system that does not exist yet, from this
 * same function.
 */

export type RoleProblem =
    /** The folder role needs to know which folder it automates. */
    | "folder-required"
    /** The role's home folder is not configured. */
    | "no-home"
    /** The canvas already holds that role. */
    | "already";

export interface RolePlan {
    role: FlowRole;
    /** The settings value to write, for the two exclusive roles. */
    settings?: { key: "ribbonCanvas" | "editorCanvas"; value: string };
    /** The canvas that stops holding the role — it keeps existing as a file. */
    displaces?: string;
    /** The move a place-based role implies. */
    move?: { from: string; to: string };
    /** Why this cannot be planned; when set, nothing else is. */
    problem?: RoleProblem;
}

export interface RoleChangeInput {
    /** The canvas being given the role. */
    path: string;
    role: FlowRole;
    folders: FlowFolders;
    /** For the folder role: the vault folder whose notes it should run on. */
    folder?: string;
}

const SETTING_OF: Partial<Record<FlowRole, "ribbonCanvas" | "editorCanvas">> = {
    create: "ribbonCanvas",
    edit: "editorCanvas",
};

/** The home folder a place-based role lives in. */
function homeOf(role: FlowRole, folders: FlowFolders): string | undefined {
    if (role === "folder") return folders.foldersFlowsPath;
    if (role === "event") return folders.eventFlowsPath;
    return undefined;
}

export function planRoleChange({ path, role, folders, folder }: RoleChangeInput): RolePlan {
    if (flowRole(path, folders) === role) return { role, problem: "already" };

    if (isExclusive(role)) {
        const key = SETTING_OF[role] as "ribbonCanvas" | "editorCanvas";
        const held = folders[key];
        return {
            role,
            settings: { key, value: path },
            ...(held && held !== path ? { displaces: held } : {}),
        };
    }

    const home = homeOf(role, folders);
    if (!home) return { role, problem: "no-home" };

    if (role === "folder") {
        if (!folder?.trim()) return { role, problem: "folder-required" };
        // A folder flow is found by its name, not by a setting: the convention is the wiring.
        return { role, move: { from: path, to: canvasPathFromFolder(home, folder.trim()) } };
    }

    const name = path.split("/").pop() ?? path;
    return { role, move: { from: path, to: `${home}/${name}` } };
}

/** Taking a role away: only the two exclusive ones can be cleared without moving a file. */
export function planRoleRemoval(path: string, folders: FlowFolders): RolePlan | undefined {
    const role = flowRole(path, folders);
    const key = SETTING_OF[role];
    if (!key) return undefined;
    return { role: "none", settings: { key, value: "" } };
}

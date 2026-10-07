import { canvasPathFromFolder } from "hooks/utils/PathUtils";
import {
    NAMED_ROLE_SETTING,
    flowRole,
    isExclusive,
    type FlowFolders,
    type FlowRole,
    type NamedRole,
    type NamedRoleSetting,
} from "architecture/plugin/canvas/flowRole";

/**
 * What giving a canvas a role would do (#435, epic #434) — pure.
 *
 * A role is not a field you set: *create*, *edit* and *crystallize* are one settings value each and
 * displace whoever held them, and *folder* and *event* are places, so taking one **moves a file**.
 * Both are writes someone has to agree to, which means they have to be shown first — and showing
 * them means computing them without doing them.
 *
 * One role per canvas (#712): the role a canvas is given replaces any named role it held. Before,
 * that held only on screen — the ribbon canvas given *Edits the open note* silently stayed both.
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
    /** The settings value to write, for the exclusive roles. */
    settings?: { key: NamedRoleSetting; value: string };
    /** The canvas that stops holding the role — it keeps existing as a file. */
    displaces?: string;
    /** The move a place-based role implies. */
    move?: { from: string; to: string };
    /** The other named roles this canvas gives up, so it keeps one role (#712). */
    releases?: { key: NamedRoleSetting; value: "" }[];
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

/** The home folder a place-based role lives in. */
function homeOf(role: FlowRole, folders: FlowFolders): string | undefined {
    if (role === "folder") return folders.foldersFlowsPath;
    if (role === "event") return folders.eventFlowsPath;
    return undefined;
}

/** Every named role other than `except` that `path` holds now — what it gives up. */
function releasesOf(path: string, folders: FlowFolders, except?: NamedRole): RolePlan["releases"] {
    const released = (Object.keys(NAMED_ROLE_SETTING) as NamedRole[])
        .filter((role) => role !== except && folders[NAMED_ROLE_SETTING[role]] === path)
        .map((role) => ({ key: NAMED_ROLE_SETTING[role], value: "" as const }));
    return released.length > 0 ? released : undefined;
}

export function planRoleChange({ path, role, folders, folder }: RoleChangeInput): RolePlan {
    if (flowRole(path, folders) === role) return { role, problem: "already" };

    if (isExclusive(role)) {
        const key = NAMED_ROLE_SETTING[role];
        const held = folders[key];
        const releases = releasesOf(path, folders, role);
        return {
            role,
            settings: { key, value: path },
            ...(held && held !== path ? { displaces: held } : {}),
            ...(releases ? { releases } : {}),
        };
    }

    const home = homeOf(role, folders);
    if (!home) return { role, problem: "no-home" };

    if (role === "folder" && !folder?.trim()) return { role, problem: "folder-required" };
    const releases = releasesOf(path, folders);
    const extra = releases ? { releases } : {};
    if (role === "folder") {
        // A folder flow is found by its name, not by a setting: the convention is the wiring.
        return { role, move: { from: path, to: canvasPathFromFolder(home, (folder ?? "").trim()) }, ...extra };
    }

    const name = path.split("/").pop() ?? path;
    return { role, move: { from: path, to: `${home}/${name}` }, ...extra };
}

/** Taking a role away: only the exclusive ones can be cleared without moving a file. */
export function planRoleRemoval(path: string, folders: FlowFolders): RolePlan | undefined {
    const role = flowRole(path, folders);
    if (!isExclusive(role)) return undefined;
    return { role: "none", settings: { key: NAMED_ROLE_SETTING[role], value: "" } };
}

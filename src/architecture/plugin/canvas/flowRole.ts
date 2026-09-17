/**
 * What a canvas **is for** (#435, epic #434) — pure.
 *
 * A canvas's role already decided almost everything about it, and the product never said the word:
 * `CanvasHelper.isCanvasFlow`, `CanvasNodeMenu`, `FileMenu` and the event engine each re-derived it
 * by hand, and had already drifted apart — one forgot the hooks folder, another forgot the editor
 * canvas, and the event engine called *any* canvas in the folder-flows folder an event flow.
 *
 * One question, one answer. The role is **derived** from settings that already exist plus the
 * events folder (#436): nothing is written into anyone's `.canvas` file.
 */

export type FlowRole = "create" | "edit" | "folder" | "event" | "hook" | "none";

/** The five homes a role can live in; every one of them is an existing setting but the events one. */
export interface FlowFolders {
    /** The canvas the ribbon opens to create a note. */
    ribbonCanvas?: string;
    /** The canvas the editor command runs on the open note. */
    editorCanvas?: string;
    /** Folder of the canvases that run when a note is created in their folder. */
    foldersFlowsPath?: string;
    /** Folder of the canvases that react to vault events (#436). */
    eventFlowsPath?: string;
    /** Folder of the canvases a property hook runs. */
    hooksFolderPath?: string;
}

/** i18n key per role; the renderer does the `t()` lookup. Pure data. */
export const FLOW_ROLE_LABEL_KEY: Record<FlowRole, string> = {
    create: "flow_role_create",
    edit: "flow_role_edit",
    folder: "flow_role_folder",
    event: "flow_role_event",
    hook: "flow_role_hook",
    none: "flow_role_none",
};

/** The roles you can hand to a canvas yourself, in the order the list offers them. */
export const ASSIGNABLE_ROLES: readonly FlowRole[] = ["create", "edit", "folder", "event"] as const;

/** A role held by exactly one canvas at a time. */
export function isExclusive(role: FlowRole): boolean {
    return role === "create" || role === "edit";
}

/**
 * The homes, read off the plugin's settings. Structural on purpose: the resolver stays pure and
 * knows nothing about `ZettelFlowSettings`.
 */
export function flowFolders(settings: {
    ribbonCanvas?: string;
    editorCanvas?: string;
    foldersFlowsPath?: string;
    eventFlowsPath?: string;
    hooks?: { folderFlowPath?: string };
}): FlowFolders {
    return {
        ribbonCanvas: settings.ribbonCanvas,
        editorCanvas: settings.editorCanvas,
        foldersFlowsPath: settings.foldersFlowsPath,
        eventFlowsPath: settings.eventFlowsPath,
        hooksFolderPath: settings.hooks?.folderFlowPath,
    };
}

/**
 * Whether `path` lives in `folder`, on a **folder boundary**. `startsWith` alone — what the four
 * old checks used — says `_ZettelFlow/folders2/x.canvas` is inside `_ZettelFlow/folders`, and an
 * unset folder (`""`) swallowed the whole vault.
 */
export function isUnderFolder(folder: string | undefined, path: string): boolean {
    const root = (folder ?? "").replace(/\/+$/, "");
    if (!root || !path) return false;
    return path === root || path.startsWith(`${root}/`);
}

/**
 * The role of a canvas. Precedence is stated rather than incidental: the two canvases you named
 * explicitly win over the folders they might also sit in, because that is the one a person chose
 * by hand.
 */
export function flowRole(path: string | undefined, folders: FlowFolders): FlowRole {
    if (!path) return "none";
    if (folders.ribbonCanvas && path === folders.ribbonCanvas) return "create";
    if (folders.editorCanvas && path === folders.editorCanvas) return "edit";
    if (isUnderFolder(folders.foldersFlowsPath, path)) return "folder";
    if (isUnderFolder(folders.eventFlowsPath, path)) return "event";
    if (isUnderFolder(folders.hooksFolderPath, path)) return "hook";
    return "none";
}

/** Whether this canvas is one of ZettelFlow's at all — the question the four checks were asking. */
export function isFlowCanvas(path: string | undefined, folders: FlowFolders): boolean {
    return flowRole(path, folders) !== "none";
}

/** Two folders that cannot both be what they claim to be. */
export interface FolderConflict {
    /** The folder being set. */
    folder: string;
    /** The one it collides with. */
    against: string;
}

/**
 * The homes must be distinct places: a canvas cannot be a folder flow *and* an event flow, so the
 * folders may be neither equal nor nested in one another. Returns the conflict rather than a
 * boolean, so the message can name what it collided with.
 */
export function validateFlowFolders(folders: FlowFolders): FolderConflict | undefined {
    const homes: [keyof FlowFolders, string][] = [
        ["foldersFlowsPath", folders.foldersFlowsPath ?? ""],
        ["eventFlowsPath", folders.eventFlowsPath ?? ""],
        ["hooksFolderPath", folders.hooksFolderPath ?? ""],
    ].filter(([, value]) => value.trim().length > 0) as [keyof FlowFolders, string][];

    for (let i = 0; i < homes.length; i++) {
        for (let j = i + 1; j < homes.length; j++) {
            const [, a] = homes[i];
            const [, b] = homes[j];
            if (a === b || isUnderFolder(a, b) || isUnderFolder(b, a)) {
                return { folder: b, against: a };
            }
        }
    }
    return undefined;
}

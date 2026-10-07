import { NAMED_ROLE_SETTING, type NamedRoleSetting } from "architecture/plugin/canvas/flowRole";

/**
 * A named role follows its canvas (#712) — pure. The ribbon canvas followed a rename by hand in
 * `VaultHooks`; the editor canvas never did. One table, so every named role does, and the next one
 * cannot be forgotten.
 */
type NamedRoleSettings = Partial<Record<NamedRoleSetting, string>>;

function settingsOf(): NamedRoleSetting[] {
    return Object.values(NAMED_ROLE_SETTING);
}

/** Point every named role held by `oldPath` at `newPath`. Returns the settings that changed. */
export function namedRolesFollowRename(settings: NamedRoleSettings, oldPath: string, newPath: string): NamedRoleSetting[] {
    const changed = settingsOf().filter((key) => settings[key] === oldPath);
    for (const key of changed) settings[key] = newPath;
    return changed;
}

/** Forget every named role held by a deleted canvas. Returns the settings that changed. */
export function namedRolesForgetDelete(settings: NamedRoleSettings, path: string): NamedRoleSetting[] {
    const changed = settingsOf().filter((key) => settings[key] === path);
    for (const key of changed) settings[key] = "";
    return changed;
}

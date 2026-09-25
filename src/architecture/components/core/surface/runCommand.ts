import { ObsidianApi } from "architecture";

/**
 * Run one of this plugin's own commands from a surface (#578, epic #574).
 *
 * Several capabilities gained a door in a view while their logic stayed in the component that
 * registers the command — the index guard, the Notices, the write. Re-implementing any of that at
 * the new door would be two code paths for one capability, which is the duplication this epic exists
 * to remove, so the door **runs the command**.
 *
 * Through the {@link ObsidianApi} facade, which is where `app.commands` is already declared and
 * contained (the ribbon menu has dispatched this way since #231).
 */
export function runCommand(id: string): void {
    // `getOwnPlugin()` can return nothing while the plugin is enabling or reloading (#374), and a
    // door that throws on a mistimed click is worse than one that does nothing.
    const pluginId = ObsidianApi.getOwnPlugin()?.manifest?.id;
    if (!pluginId) return;
    ObsidianApi.executeCommandById(`${pluginId}:${id}`);
}

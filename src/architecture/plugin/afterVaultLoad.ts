/**
 * Hear a vault event only once Obsidian has finished loading the vault (#795).
 *
 * While it loads, Obsidian announces every existing file with a `create`. A view restored at
 * startup opens before that, so a `create` listener registered in it heard the whole vault, one file
 * at a time — Home reset its recompute timer once per note. Wrapped in this, the flood passes by and
 * a note created afterwards is heard as before.
 *
 * A host that cannot say whether its layout is ready (a test double, a partial app) lets everything
 * through: the guard only ever removes the startup flood, never a real event.
 */
export function afterVaultLoad<A extends unknown[]>(
    app: { workspace?: { layoutReady?: boolean } } | undefined,
    handler: (...args: A) => void
): (...args: A) => void {
    return (...args: A) => {
        if (app?.workspace?.layoutReady === false) return;
        handler(...args);
    };
}

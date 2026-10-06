/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A key pressed while the reader leaf is active (#667) — dispatched the way Obsidian's keymap does:
 * to the view's `scope`, whatever element has focus, with `preventDefault` when a handler says it
 * took the key (`false`). Ctrl/Cmd/Alt/Shift go into the context's modifier string, as in the app.
 */
export function press(at: { view?: any; ownerView?: any }, key: string, extra: Record<string, any> = {}): any {
    const modifiers = [
        ...(extra.altKey ? ["Alt"] : []),
        ...(extra.ctrlKey ? ["Ctrl"] : []),
        ...(extra.metaKey ? ["Meta"] : []),
        ...(extra.shiftKey ? ["Shift"] : []),
    ]
        .sort()
        .join(",");
    const evt: any = {
        key,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault: () => (evt.defaultPrevented = true),
        stopPropagation: () => (evt.propagationStopped = true),
        ...extra,
    };
    // A leaf (`leaf.view`) or what a view drew into (the mock's `ownerView`).
    const scope = (at.view ?? at.ownerView)?.scope;
    if (!scope) throw new Error("the view has no keymap scope");
    if (scope.handleKey(evt, { modifiers, key }) === false) {
        evt.preventDefault();
        evt.stopPropagation();
    }
    return evt;
}

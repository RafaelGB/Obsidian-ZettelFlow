/** Anything that can be torn down — a React root, in practice. */
export interface Unmountable {
    unmount(): void;
}

/**
 * A root that outlives Obsidian's re-render of the row it lives in (#659 runtime audit).
 *
 * Obsidian's declarative settings tab keeps a row across `update()`: it runs the row's **old**
 * cleanup first, then `render` again on the same element. A cleanup that unmounted the React root
 * (deferred a tick, so React is not torn down mid-commit) and a render that saw the container already
 * there and returned early left the panel **blank** after the timer fired — which every flow role
 * change triggered.
 *
 * So the unmount is only *scheduled* by the cleanup, and the next render of the same container
 * cancels it and keeps the root. A root is created only when there is none for this container; a
 * different container (a fresh tab render) replaces the old one. Closing the tab lets the timer run.
 */
export function keptRoot<R extends Unmountable>(create: (container: HTMLElement) => R): (container: HTMLElement) => () => void {
    let current: { container: HTMLElement; root: R; timer: number | null } | null = null;
    return (container) => {
        if (current && current.container !== container) {
            if (current.timer !== null) window.clearTimeout(current.timer);
            current.root.unmount();
            current = null;
        }
        if (current) {
            if (current.timer !== null) window.clearTimeout(current.timer);
            current.timer = null;
        } else {
            current = { container, root: create(container), timer: null };
        }
        const mounted = current;
        return () => {
            if (mounted.timer !== null) return;
            mounted.timer = window.setTimeout(() => {
                mounted.timer = null;
                if (current === mounted) current = null;
                mounted.root.unmount();
            }, 0);
        };
    };
}

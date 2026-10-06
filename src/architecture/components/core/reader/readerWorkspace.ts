import type { ReaderSidesState } from "./readerContract";

/** The part of a sidedock the reader touches — `WorkspaceSidedock` and `WorkspaceMobileDrawer` both have it. */
export interface SideLike {
    collapsed: boolean;
    collapse(): void;
    expand(): void;
}

/** How the sidebars were before the reader took the window. */
export function snapshotSides(left: SideLike, right: SideLike): ReaderSidesState {
    return { left: left.collapsed, right: right.collapsed };
}

/** Take the window: fold away whichever sidebar is open. */
export function collapseSides(left: SideLike, right: SideLike): void {
    if (!left.collapsed) left.collapse();
    if (!right.collapsed) right.collapse();
}

/**
 * Give the workspace back exactly as it was: a sidebar that was open opens again, one that was
 * already folded stays folded — the reader never leaves a layout the user did not choose.
 */
export function restoreSides(snapshot: ReaderSidesState, left: SideLike, right: SideLike): void {
    if (!snapshot.left && left.collapsed) left.expand();
    if (snapshot.left && !left.collapsed) left.collapse();
    if (!snapshot.right && right.collapsed) right.expand();
    if (snapshot.right && !right.collapsed) right.collapse();
}

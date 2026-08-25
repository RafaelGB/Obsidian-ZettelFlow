/**
 * A tiny one-shot handoff for the "explore in 3D" deep-link (#280 S3). A command elsewhere records the
 * note path it wants the 3D graph to focus; the {@link Graph3DRenderer} consumes it once on mount and
 * flies the camera there. Kept as a module singleton (no Obsidian import) so the command and the view
 * stay decoupled and the consume-once semantics are unit-testable.
 */
let pending: string | null = null;

/** Request that the next 3D graph render focus (fly to) this note path. */
export function requestGraph3DFocus(path: string): void {
    pending = path && path.length > 0 ? path : null;
}

/** Take the pending focus path (if any), clearing it — so it fires exactly once. */
export function consumeGraph3DFocus(): string | null {
    const value = pending;
    pending = null;
    return value;
}

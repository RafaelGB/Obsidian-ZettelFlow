/**
 * An undo offered in the moment (#455, epic #451) — pure.
 *
 * Of everything ZettelFlow writes, a property hook's write is the one that surprises people: it
 * fires on a note you were not looking at, changes its frontmatter, and the only trace is a notice
 * that is gone in five seconds. It is the write you most want to take back **immediately**, and
 * the one you are least likely to be reading a record about.
 *
 * So the hook's notice carries an undo, live for thirty seconds. There is no new machinery behind
 * it: the batch is the same batch, the plan is the same plan. This module is only the *window* —
 * pure, so the offer's lifetime can be tested without waiting half a minute.
 */

import { isUndoableKind, type VaultWrite } from "./vaultWriteLog";

/** Thirty seconds. Long enough to read the notice, short enough not to become a second inbox. */
export const UNDO_OFFER_MS = 30_000;

export type OfferState = "live" | "expired";

/**
 * Whether an offer made at `offeredAt` is still open. A clock that went backwards counts as live:
 * a system time correction must not silently swallow an offer you can see on screen.
 */
export function offerState(offeredAt: number, now: number): OfferState {
    return now - offeredAt >= UNDO_OFFER_MS ? "expired" : "live";
}

/**
 * Whether there is anything here worth offering to undo.
 *
 * The common case for an idempotent hook is that it set a property to the value it already had —
 * which recorded no write at all, because the record is a diff. Nothing changed, so nothing is
 * offered, and the notice stays a notice.
 */
export function worthOffering(writes: VaultWrite[]): boolean {
    return writes.some((write) => write.undone === undefined && isUndoableKind(write.kind));
}

import type { DueClaim } from "architecture/knowledge/state";

/**
 * **Came back today** (#704, epic #701) — one quiet stack instead of separate tiles.
 *
 * What came back is what you marked in the Reader (the highlights review, #678) and, at most one at
 * a time, a claim or a wager of yours (#563, #571). Highlights lead: they are a passage you chose to
 * keep, and they are answered in a breath. The claim follows. Nothing here grows while you are not
 * looking — the stack is what is due today, and a day you skip it looks the same tomorrow.
 *
 * Pure: what is due in, the order out.
 */
export type CameBackItem = { kind: "highlights" } | { kind: "claim"; claim: DueClaim };

/** The day a *let it go* is about — a local calendar day, so it lifts at midnight, not in 24 hours. */
export function dayKey(now: number): string {
    const date = new Date(now);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * The stack, in order: highlights first when any are due, then the one claim unless you let it go
 * today. *Let it go* is about your attention, not about whether the claim is right — so it records
 * no judgement and lasts the day (§XII).
 */
export function cameBackOrder(input: {
    highlightsDue: boolean;
    claim: DueClaim | null;
    letGo: ReadonlySet<string>;
    now: number;
}): CameBackItem[] {
    const items: CameBackItem[] = [];
    if (input.highlightsDue) items.push({ kind: "highlights" });
    if (input.claim && !input.letGo.has(`${dayKey(input.now)}:${input.claim.path}`)) {
        items.push({ kind: "claim", claim: input.claim });
    }
    return items;
}

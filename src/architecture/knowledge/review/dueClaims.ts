import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { Snapshot } from "../timeline/recordSnapshot";
import type { Judgement } from "../judgement/Judgement";
import { claimSubject } from "../claims/keys";
import type { Wager } from "../claims/wager";

/**
 * When a claim comes back (#563, epic #558) — pure.
 *
 * Every surface in this product is **pull**: you open it and it tells you where you are. Nothing
 * has ever come to you, and a mirror you have to remember to look into cannot show you what you
 * had forgotten — which is the only thing worth showing.
 *
 * This is the arithmetic behind the one line that does. It is deliberately not a scheduler and not
 * a repetition algorithm: there is **one duration you chose**, it does not adapt to your answers,
 * and it returns **at most one** claim. A queue would be an inbox, an inbox is a debt, and a debt
 * greets you with how far behind you are — the argument #469 already made for the Lab.
 *
 * It reads only what already exists: the claim from the model, the last claim change from the
 * timeline's snapshots, the note's `last-reviewed` property, and the record's last verdict on this
 * claim. With the timeline off it still works, from the record alone.
 */

const DAY_MS = 86_400_000;

/** The shortest interval offered. Below a week, a claim comes back before you have forgotten it. */
export const RETURN_INTERVAL_MIN_DAYS = 7;
/** The longest. At the maximum, a fresh vault never offers anything, which is what AC-6 asserts. */
export const RETURN_INTERVAL_MAX_DAYS = 365;
/**
 * The default. A guess, and honestly labelled as one: the reference vault had **zero** claims when
 * this shipped, so no measurement could inform it. Long enough to have forgotten what you wrote,
 * short enough to see the loop close inside one release.
 */
export const DEFAULT_RETURN_INTERVAL_DAYS = 90;

export interface DueClaim {
    path: string;
    /** The sentence, so the caller need not read the note again to open the return. */
    claim: string;
    /** When this claim was last touched, by any of the four things that count as touching it. */
    lastTouched: number;
    /**
     * Which kind of thing is coming back (#571).
     *
     * A **wager** is a claim whose horizon has arrived — a date you set, which is why it outranks
     * an interval nobody chose. It comes through this selector and not a sibling one, so *at most
     * one at a time* stays true across both kinds by the same line that already makes it true for
     * claims.
     */
    kind: "claim" | "wager";
    /** The wager, when `kind` is `"wager"` — what you expected, and the day you said. */
    wager?: Wager;
}

export interface DueClaimsInput {
    model: KnowledgeModel;
    /** The judgement record. A verdict on this claim resets its clock, whatever the verdict was. */
    judgements?: Judgement[];
    /** The timeline's snapshots, when they are being kept. */
    snapshots?: Record<string, Snapshot[]>;
    /** The note's `last-reviewed` property, resolved by the caller (the model carries no frontmatter). */
    lastReviewed?: Record<string, number>;
    /** The wagers the vault is holding, resolved by the caller for the same reason (#571). */
    horizons?: Record<string, Wager>;
    intervalDays: number;
    now: number;
}

/** Every note that actually says something, with its first claim. */
export function claimBearingPaths(model: KnowledgeModel): { path: string; claim: string }[] {
    const bearing: { path: string; claim: string }[] = [];
    for (const idea of model.all()) {
        const claim = idea.claims[0]?.text?.trim();
        if (claim) bearing.push({ path: idea.path, claim });
    }
    return bearing;
}

/**
 * When this note's claims last **changed**.
 *
 * Not the last snapshot: snapshots are taken on a lifecycle change too, and being promoted to
 * `permanent` is not you saying anything new. The baseline is used when nothing has changed since,
 * because the first time a claim was seen is the honest answer to *how long has this stood*.
 */
export function lastClaimChangeAt(history?: Snapshot[]): number | undefined {
    if (!history || history.length === 0) return undefined;
    for (let index = history.length - 1; index > 0; index--) {
        if (!sameClaims(history[index].claims, history[index - 1].claims)) return history[index].at;
    }
    return history[0].at;
}

function sameClaims(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const left = [...a].sort();
    const right = [...b].sort();
    return left.every((value, index) => value === right[index]);
}

/** The newest verdict recorded about this note's claim, whatever it said. */
function lastVerdictAt(path: string, judgements: Judgement[]): number | undefined {
    const subject = claimSubject(path);
    let newest: number | undefined;
    for (const entry of judgements) {
        if (entry.subject !== subject) continue;
        if (newest === undefined || entry.at > newest) newest = entry.at;
    }
    return newest;
}

/**
 * The one claim to offer back, or nothing.
 *
 * At most one, ever — and the oldest, so what comes back is what you are most likely to have
 * forgotten. Deterministic: ties break by path, so two runs of the same vault agree.
 */
export function dueClaims(input: DueClaimsInput): DueClaim[] {
    const { model, intervalDays, now } = input;
    const judgements = input.judgements ?? [];
    const snapshots = input.snapshots ?? {};
    const lastReviewed = input.lastReviewed ?? {};
    const horizons = input.horizons ?? {};
    const interval = Math.max(1, intervalDays) * DAY_MS;

    let oldest: DueClaim | undefined;
    let dueWager: DueClaim | undefined;
    for (const { path, claim } of claimBearingPaths(model)) {
        // A horizon is a date **you** set, so it outranks an interval you merely accepted. Still
        // one thing at a time: the wager wins the single slot, it does not get a second one.
        const wager = horizons[path];
        if (wager && now >= wager.at) {
            if (
                !dueWager ||
                wager.at < (dueWager.wager?.at ?? 0) ||
                (wager.at === dueWager.wager?.at && path < dueWager.path)
            ) {
                dueWager = { path, claim, lastTouched: wager.at, kind: "wager", wager };
            }
            continue;
        }

        const idea = model.get(path);
        const lastTouched = Math.max(
            idea?.modified ?? 0,
            lastClaimChangeAt(snapshots[path]) ?? 0,
            lastReviewed[path] ?? 0,
            lastVerdictAt(path, judgements) ?? 0
        );
        if (now - lastTouched < interval) continue;
        if (
            !oldest ||
            lastTouched < oldest.lastTouched ||
            (lastTouched === oldest.lastTouched && path < oldest.path)
        ) {
            oldest = { path, claim, lastTouched, kind: "claim" };
        }
    }
    return dueWager ? [dueWager] : oldest ? [oldest] : [];
}

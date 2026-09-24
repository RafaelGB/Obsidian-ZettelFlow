import { EXPECTATION_KEYS, HORIZON_KEYS } from "./keys";

/**
 * A claim you can be wrong about (#570, epic #560) — pure.
 *
 * Everything ZettelFlow records is about the vault: a note changed, a link appeared, a claim was
 * rewritten, a verdict was given. **Nothing in it has ever been checked against what actually
 * happened.** A wager is the smallest object that changes that — the same claim, plus what you
 * expect to see and by when.
 *
 * It is deliberately **not a new object**: two optional frontmatter fields on a note that already
 * makes a claim. `Idea` gains nothing and `ClaimSourceSchema` is untouched, so every reader of a
 * claim sees exactly what it saw before.
 */

/** What you expect to see, and the day you expect to know by. Both, or it is not a wager. */
export interface Wager {
    expectation: string;
    /** Start of the horizon's **local** day, in epoch ms. */
    at: number;
}

/**
 * A date property, however it was written, as the start of its own **local** day.
 *
 * The local part is the whole point. `Date.parse("2026-12-01")` is UTC midnight, so west of
 * Greenwich the wager would come due the evening **before** — breaking *never before its horizon*
 * in the one place a user would notice. A day you typed is a day where you are.
 *
 * Anything unparseable is simply not a horizon: no throw, no log, no complaint. The tolerance
 * `lastReviewedOf.toTime` already has (#563).
 */
export function horizonAt(value: unknown): number | undefined {
    if (value instanceof Date) return startOfLocalDay(value);
    if (typeof value === "number") return Number.isFinite(value) ? startOfLocalDay(new Date(value)) : undefined;
    if (typeof value !== "string") return undefined;

    const text = value.trim();
    if (text.length === 0) return undefined;

    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (plain) {
        const year = Number(plain[1]);
        const month = Number(plain[2]);
        const day = Number(plain[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
        const made = new Date(year, month - 1, day);
        // `new Date(2026, 12, 45)` rolls over into a perfectly valid date. Ask it back.
        if (made.getFullYear() !== year || made.getMonth() !== month - 1 || made.getDate() !== day) {
            return undefined;
        }
        return made.getTime();
    }

    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? undefined : startOfLocalDay(new Date(parsed));
}

function startOfLocalDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A horizon as the `<input type="date">` value for it — local, so it round-trips what was typed. */
export function toDateInput(at: number): string {
    const date = new Date(at);
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

function firstOf(frontmatter: Record<string, unknown> | undefined, keys: readonly string[]): unknown {
    for (const key of keys) {
        const value = frontmatter?.[key];
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}

/**
 * The wager a note carries, if it carries one.
 *
 * **Both halves or nothing.** An expectation with no date is a sentence you have no way of
 * resolving, and a date with no expectation is a reminder — which is the thing this epic refuses.
 * It also makes a note whose `by:` means something else entirely (`by: Rafael Gómez`) inert rather
 * than a wager about nothing.
 */
export function wagerOf(frontmatter: Record<string, unknown> | undefined): Wager | undefined {
    const raw = firstOf(frontmatter, EXPECTATION_KEYS);
    const expectation = typeof raw === "string" ? raw.trim() : "";
    if (expectation.length === 0) return undefined;

    const at = horizonAt(firstOf(frontmatter, HORIZON_KEYS));
    return at === undefined ? undefined : { expectation, at };
}

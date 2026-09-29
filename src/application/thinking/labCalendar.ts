/**
 * A calendar to reach a day, never a report of one (#596, slice 3) — pure.
 *
 * The list is time, newest first; the calendar is the other way in — jump to a year, a month, a day.
 * Two rules run through all of it:
 *
 * - **Local, not UTC.** The day a thought belongs to is the day *you* were in when you wrote it. A
 *   thought at 1 a.m. is on that day, not shunted to the previous one by a timezone offset.
 * - **Presence, never a count.** A day has thoughts or it does not — a dot, not "14 on Tuesday".
 *   Counting what you wrote per day is the productivity report the Lab refuses to be (#469), so the
 *   buckets are `Set`s: membership is the whole of what they say.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

/** The local-time day a timestamp falls in, as `YYYY-MM-DD`. */
export function dayKey(at: number): string {
    const date = new Date(at);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local-time month a timestamp falls in, as `YYYY-MM`. */
export function monthKey(at: number): string {
    return dayKey(at).slice(0, 7);
}

/** The set of local days that have at least one thought — presence, never how many. */
export function presentDays(times: readonly number[]): Set<string> {
    return new Set(times.map(dayKey));
}

/** The set of local months that have at least one thought. */
export function presentMonths(times: readonly number[]): Set<string> {
    return new Set(times.map(monthKey));
}

/** The real days of a month, 1..N, each with its local day key — the cells a grid draws. */
export function monthDays(year: number, month0: number): { day: number; key: string }[] {
    const count = new Date(year, month0 + 1, 0).getDate();
    return Array.from({ length: count }, (_unused, index) => {
        const day = index + 1;
        return { day, key: `${year}-${pad(month0 + 1)}-${pad(day)}` };
    });
}

/**
 * How many blank cells lead the first of the month, given the day the week starts on
 * (0 = Sunday … 6 = Saturday).
 */
export function leadingBlanks(year: number, month0: number, weekStartsOn: number): number {
    return (new Date(year, month0, 1).getDay() - weekStartsOn + 7) % 7;
}

/** The twelve months of a year, each with its key — the cells the year view draws. */
export function monthsOfYear(year: number): { month: number; key: string }[] {
    return Array.from({ length: 12 }, (_unused, month) => ({ month, key: `${year}-${pad(month + 1)}` }));
}

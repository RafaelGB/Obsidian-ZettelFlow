import type { HorizonEvent, TimelineEvent, TimelineEventKind } from "./timelineEvents";

/**
 * **The note's story** (#642, epic #639) — the timeline's event stream, arranged to be read.
 *
 * The stream (#168/#362/#494/#540/#564/#572/#581) already holds every fact; this decides only how it
 * is laid out: newest first, under month headings, a run of unchanged snapshots folded to one row,
 * a filter you chose, and the one event that has not happened pinned above the rest. Pure and
 * clock-free — "now" is an argument — so every rule here is a unit test, not a screenshot.
 */

export type StoryFilter = "all" | "decisions" | "moves" | "thoughts";
export type StoryChipId = Exclude<StoryFilter, "all">;

/** What you decided: a verdict, a return (a verdict and the change it caused), a promotion. */
export const DECISION_KINDS: ReadonlySet<TimelineEventKind> = new Set<TimelineEventKind>(["judgement", "return", "promotion"]);

const CHIP_KINDS: Record<StoryChipId, ReadonlySet<TimelineEventKind>> = {
    decisions: DECISION_KINDS,
    moves: new Set<TimelineEventKind>(["move"]),
    thoughts: new Set<TimelineEventKind>(["thought"]),
};
const CHIP_ORDER: readonly StoryChipId[] = ["decisions", "moves", "thoughts"];

export interface StoryChip {
    id: StoryChipId;
    count: number;
}

/** A row of the rail: an event, or the fold that stands for a run of unchanged snapshots. */
export type StoryRow =
    | { kind: "event"; event: TimelineEvent }
    /** `key` is the newest snapshot's time, `hidden` how many older ones it stands for. */
    | { kind: "fold"; key: number; hidden: number };

export interface StoryGroup {
    year: number;
    /** 0-based, like `Date#getMonth`. */
    month0: number;
    rows: StoryRow[];
}

export interface Story {
    /** The day you expect to know by, while it is today or later (#572). Never in a group. */
    pinned?: HorizonEvent;
    /** The chips other than *All*, zeros dropped. Empty means there is no chip row. */
    chips: StoryChip[];
    groups: StoryGroup[];
    /** Every event, the pinned one included — whether there is a story to share. */
    total: number;
}

export interface StoryOptions {
    now: number;
    filter?: StoryFilter;
    /** The folds you opened, by key. */
    expanded?: ReadonlySet<number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of the local calendar day `at` falls in. */
export function startOfLocalDay(at: number): number {
    const day = new Date(at);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
}

export function projectStory(events: readonly TimelineEvent[], options: StoryOptions): Story {
    const filter = options.filter ?? "all";
    const expanded = options.expanded ?? new Set<number>();
    const today = startOfLocalDay(options.now);

    // One event has not happened yet, and while it has not it sits above the story (#572).
    const pinnedEvent = events.find((event) => event.kind === "horizon" && event.horizon && event.at >= today);
    const past = events.filter((event) => event !== pinnedEvent);

    const chips = CHIP_ORDER.map((id) => ({ id, count: past.filter((event) => CHIP_KINDS[id].has(event.kind)).length })).filter(
        (chip) => chip.count > 0
    );

    const visible = filter === "all" ? past : past.filter((event) => CHIP_KINDS[filter].has(event.kind));
    // The stream is oldest first; the story is read newest first. Reversing keeps ties stable.
    const newestFirst = [...visible].reverse();

    const groups: StoryGroup[] = [];
    for (const event of newestFirst) {
        const date = new Date(event.at);
        const year = date.getFullYear();
        const month0 = date.getMonth();
        const last = groups[groups.length - 1];
        if (last && last.year === year && last.month0 === month0) last.rows.push({ kind: "event", event });
        else groups.push({ year, month0, rows: [{ kind: "event", event }] });
    }

    return {
        ...(pinnedEvent?.horizon ? { pinned: pinnedEvent.horizon } : {}),
        chips,
        groups: groups.map((group) => ({ ...group, rows: fold(group.rows, expanded) })),
        total: events.length,
    };
}

/**
 * Fold each run of consecutive snapshots with the same state (FR-8). The newest stays visible; the
 * rest stand behind one row. A run never crosses another event or a month — the group is a month.
 */
function fold(rows: StoryRow[], expanded: ReadonlySet<number>): StoryRow[] {
    const out: StoryRow[] = [];
    let index = 0;
    while (index < rows.length) {
        const row = rows[index];
        const state = row.kind === "event" && row.event.kind === "snapshot" ? row.event.snapshot?.state : undefined;
        if (state === undefined) {
            out.push(row);
            index++;
            continue;
        }
        let end = index + 1;
        while (end < rows.length) {
            const next = rows[end];
            if (next.kind !== "event" || next.event.kind !== "snapshot" || next.event.snapshot?.state !== state) break;
            end++;
        }
        const run = rows.slice(index, end);
        const key = row.kind === "event" ? row.event.at : 0;
        if (run.length > 1 && !expanded.has(key)) out.push(row, { kind: "fold", key, hidden: run.length - 1 });
        else out.push(...run);
        index = end;
    }
    return out;
}

export type RelativeUnit = "today" | "yesterday" | "days" | "months" | "years";

/**
 * How long ago, in the reader's calendar (FR-4): today, yesterday, days up to a month, then months,
 * then years. No weeks — one unit fewer to read. A clock running ahead reads as today.
 */
export function relativeAge(at: number, now: number): { unit: RelativeUnit; n: number } {
    const days = Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / DAY_MS);
    if (days <= 0) return { unit: "today", n: 0 };
    if (days === 1) return { unit: "yesterday", n: 1 };
    if (days <= 30) return { unit: "days", n: days };
    const then = new Date(at);
    const current = new Date(now);
    let months = (current.getFullYear() - then.getFullYear()) * 12 + (current.getMonth() - then.getMonth());
    if (current.getDate() < then.getDate()) months--;
    months = Math.max(1, months);
    if (months < 12) return { unit: "months", n: months };
    return { unit: "years", n: Math.floor(months / 12) };
}

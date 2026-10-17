import { lastSample, sampleCount, type Measurable, type Sample } from "architecture/monitoring/measure";

/**
 * How fast it is **here** (#462, epic #452) — pure.
 *
 * The budgets in CI measure a synthetic vault on a build runner. That is the right thing to gate
 * a release on and the wrong thing to answer *"is this slow for me?"* — which depends on your
 * vault, your machine and your disk. So the same instrument that CI asserts against also feeds a
 * small section of the Health surface, and what you read there is literally what was measured on
 * your last launch.
 *
 * **Facts, and nothing else** (§XII). A duration, a note count and a timestamp. No score, no
 * band, no colour, no "your vault is slow", no advice about what to do — the same subtraction
 * #360 made when it removed the telemetry track. A number invites you to draw your own conclusion;
 * a verdict draws it for you, and this is your vault.
 */

/**
 * The timings worth showing, and the key each is labelled with. A `counted` row also says how many
 * times it ran this session (#825): a page turn happens hundreds of times, a start-up once — and a
 * start-up row reading "1 time" would be noise, so only the reading moments carry it.
 */
export const SPEED_ROWS: { name: Measurable; labelKey: string; counted?: true }[] = [
    // What starting cost (#795): the plugin's own load, and the one build at layout-ready.
    { name: "plugin.load", labelKey: "speed_row_plugin_load" },
    { name: "index.startup", labelKey: "speed_row_index_startup" },
    { name: "index.build", labelKey: "speed_row_index" },
    { name: "enrich.full", labelKey: "speed_row_enrich" },
    { name: "enrich.incremental", labelKey: "speed_row_enrich_incremental" },
    { name: "analysis.heaviest", labelKey: "speed_row_analysis" },
    { name: "scope.census", labelKey: "speed_row_scope" },
    { name: "reader.paginate", labelKey: "speed_row_paginate" },
    // The four moments a reader waits through (#825).
    { name: "reader.chapter.open", labelKey: "speed_row_chapter_open", counted: true },
    { name: "reader.page.turn", labelKey: "speed_row_page_turn", counted: true },
    { name: "reader.relayout", labelKey: "speed_row_relayout", counted: true },
    { name: "reader.chapter.turn.start", labelKey: "speed_row_chapter_turn", counted: true },
];

export interface SpeedFact {
    labelKey: string;
    ms: number;
    /** What it was measured over — a note count — when the measurement said. */
    scale?: number;
    /** Unix ms of when it was measured. */
    at: number;
    /** How many times it ran this session — on the counted rows only. */
    count?: number;
}

export interface SpeedFacts {
    facts: SpeedFact[];
    /** True when nothing has been measured yet, so the surface can say so instead of showing zeros. */
    empty: boolean;
}

/** Read the latest timing of each kind. A kind never measured is absent, not zero. */
export function speedFacts(
    read: (name: Measurable) => Sample | undefined = lastSample,
    count: (name: Measurable) => number = sampleCount
): SpeedFacts {
    const facts: SpeedFact[] = [];
    for (const row of SPEED_ROWS) {
        const sample = read(row.name);
        if (!sample) continue;
        facts.push({
            labelKey: row.labelKey,
            ms: sample.ms,
            at: sample.at,
            ...(sample.scale === undefined ? {} : { scale: sample.scale }),
            ...(row.counted ? { count: count(row.name) } : {}),
        });
    }
    return { facts, empty: facts.length === 0 };
}

/** A duration as it reads best: milliseconds under a second, seconds above. */
export function formatDuration(ms: number): string {
    if (ms < 1) return "<1 ms";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

import { lastSample, type Measurable, type Sample } from "architecture/monitoring/measure";

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

/** The timings worth showing, and the key each is labelled with. */
export const SPEED_ROWS: { name: Measurable; labelKey: string }[] = [
    { name: "index.build", labelKey: "speed_row_index" },
    { name: "enrich.full", labelKey: "speed_row_enrich" },
    { name: "enrich.incremental", labelKey: "speed_row_enrich_incremental" },
    { name: "analysis.heaviest", labelKey: "speed_row_analysis" },
];

export interface SpeedFact {
    labelKey: string;
    ms: number;
    /** What it was measured over — a note count — when the measurement said. */
    scale?: number;
    /** Unix ms of when it was measured. */
    at: number;
}

export interface SpeedFacts {
    facts: SpeedFact[];
    /** True when nothing has been measured yet, so the surface can say so instead of showing zeros. */
    empty: boolean;
}

/** Read the latest timing of each kind. A kind never measured is absent, not zero. */
export function speedFacts(read: (name: Measurable) => Sample | undefined = lastSample): SpeedFacts {
    const facts: SpeedFact[] = [];
    for (const row of SPEED_ROWS) {
        const sample = read(row.name);
        if (!sample) continue;
        facts.push({
            labelKey: row.labelKey,
            ms: sample.ms,
            at: sample.at,
            ...(sample.scale === undefined ? {} : { scale: sample.scale }),
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

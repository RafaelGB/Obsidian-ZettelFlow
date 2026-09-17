import { STEP_PHASES, type StepPhase } from "./phases";

/**
 * What a colour **means** on a ZettelFlow canvas (#429, epic #422) — pure.
 *
 * A node's colour was decoration travelling as information: you picked it by eye, and
 * `getCanvasColor` carried it into the wizard as an accent that meant whatever you remembered it
 * meant. A step already declares the phase of the knowledge arc it advances (#149), and that is
 * the thing worth seeing at a glance — so the phase decides the colour, in one definition both the
 * canvas and the wizard read.
 *
 * **Seven phases, six canvas presets.** Obsidian's canvas offers colours `1`–`6`. Rather than
 * leaving a phase colourless — meaning present but invisible — REVIEW and CONSOLIDATE **share**
 * the last one: they are the same closing movement, judging and settling what a note became. The
 * legend says so out loud; colour is never the only carrier (the phase label and the badges say it
 * too), so a shared hue costs nobody the meaning.
 */

/** An Obsidian canvas colour preset. */
export type CanvasColorKey = "1" | "2" | "3" | "4" | "5" | "6";

/** The one definition: phase → canvas colour preset. */
export const PHASE_CANVAS_COLOR: Record<StepPhase, CanvasColorKey> = {
    CAPTURE: "1",
    CLASSIFY: "2",
    PROCESS: "3",
    CONNECT: "4",
    DEVELOP: "5",
    REVIEW: "6",
    CONSOLIDATE: "6",
};

/** The colour a phase paints with, or nothing at all for an unphased step. */
export function phaseCanvasColor(phase: StepPhase | undefined): CanvasColorKey | undefined {
    return phase ? PHASE_CANVAS_COLOR[phase] : undefined;
}

/**
 * The colour a step is drawn with: its own if it has one, its phase's otherwise. A colour someone
 * picked is never overridden — the phase only fills a gap — and because the wizard's accent reads
 * this same function, a phased step looks the same on the canvas and in the option list (AC-4).
 */
export function stepCanvasColor(
    nodeColor: string | undefined,
    phase: StepPhase | undefined
): string | undefined {
    return nodeColor || phaseCanvasColor(phase);
}

/** One colour and everything it means, in canonical phase order — what the legend renders. */
export interface PhaseColourEntry {
    color: CanvasColorKey;
    phases: StepPhase[];
}

/**
 * The legend's rows: one per distinct colour, naming every phase that shares it. A shared colour is
 * stated, never hidden — the canvas explains its own language.
 */
export function phaseColourLegend(): PhaseColourEntry[] {
    const entries: PhaseColourEntry[] = [];
    for (const phase of STEP_PHASES) {
        const color = PHASE_CANVAS_COLOR[phase];
        const existing = entries.find((entry) => entry.color === color);
        if (existing) {
            existing.phases.push(phase);
        } else {
            entries.push({ color, phases: [phase] });
        }
    }
    return entries;
}

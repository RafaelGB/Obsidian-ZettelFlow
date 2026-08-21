import type { Idea } from "../model/Idea";
import { STATE_FACTOR } from "architecture/knowledge/derive/maturityLogic";

/** A unit of *thinking* — an idea being developed, not merely created (#162). */
export type DevelopmentEventType = "state-advanced" | "source-added" | "connection-added";

/**
 * Pure diff of two {@link Idea} snapshots yielding the development events between them (#162, FR-1..3).
 * In canonical order: `state-advanced` (the lifecycle state factor rose, per #153 `STATE_FACTOR`),
 * `source-added` (gained its first source), `connection-added` (outgoing degree grew). A brand-new
 * note (`before === undefined`) is NOT a development event — momentum measures developing existing
 * ideas, not creation/import. Obsidian-free, deterministic.
 */
export function detectDevelopmentEvents(before: Idea | undefined, after: Idea): DevelopmentEventType[] {
    if (!before) return [];
    const events: DevelopmentEventType[] = [];
    if ((STATE_FACTOR[after.state] ?? 0) > (STATE_FACTOR[before.state] ?? 0)) {
        events.push("state-advanced");
    }
    if (!before.maturitySignals.hasSources && after.maturitySignals.hasSources) {
        events.push("source-added");
    }
    if (after.maturitySignals.outDegree > before.maturitySignals.outDegree) {
        events.push("connection-added");
    }
    return events;
}

import { tCount } from "architecture/lang";

/**
 * A duration a slider stands for, said in words: "90 days", "1 day" (#662). A length of time you
 * set, not a tally of anything — so it lives apart from the modules whose rule is to count nothing.
 */
export function daysLabel(days: number): string {
    return tCount(days, "settings_duration_days", String(days));
}

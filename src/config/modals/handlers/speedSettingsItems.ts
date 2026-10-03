import { moment as obsidianMoment, type SettingGroupItem } from "obsidian";
import type MomentFn from "moment";
import { t, tCount } from "architecture/lang";
import { formatDuration, speedFacts } from "architecture/knowledge/state";
import { lastSample, type Measurable, type Sample } from "architecture/monitoring/measure";

/** Obsidian re-exports moment without its call signature; the app's own tabs do the same cast. */
const moment = obsidianMoment as unknown as typeof MomentFn;

type LocaleKey = Parameters<typeof t>[0];

/**
 * **How fast it is here** (#462), as read-only rows in Settings › Advanced (#645, D8).
 *
 * The timings are facts about this plugin on this machine — what you look at when something feels
 * slow, not while you tend your notes — so they left the Health surface for the developer group.
 * They are the same numbers: the last sample of each kind, read, never measured here. A name and a
 * description each; no control, nothing written. Facts only (§XII): no band, no colour, no advice.
 */
export function speedSettingsItems(
    read: (name: Measurable) => Sample | undefined = lastSample
): SettingGroupItem[] {
    const facts = speedFacts(read);
    // Said once, without ceremony, instead of a table of zeros.
    if (facts.empty) return [{ name: t("speed_never_measured") }];
    return [
        { name: t("speed_title"), desc: t("speed_intro") },
        ...facts.facts.map((fact) => ({
            name: t(fact.labelKey as LocaleKey),
            desc: [
                formatDuration(fact.ms),
                ...(fact.scale === undefined ? [] : [tCount(fact.scale, "speed_over_notes", String(fact.scale))]),
                t("speed_measured_at", moment(fact.at).fromNow()),
            ].join(" · "),
        })),
    ];
}

/**
 * What you have switched on, in one place (#440, epic #434) — pure.
 *
 * Nothing in the panel said it. Whether AI was off, whether the thinking friction was on, which
 * canvas your ribbon opens, how many hooks you have, whether anything is being logged — all of it
 * required scrolling sixty rows and remembering. It is derived, never stored, so it cannot drift
 * from the settings it reports.
 */

export interface SettingsFact {
    /** i18n key of what the fact is about. */
    labelKey: string;
    /** The value, when it is a name or a number. */
    value?: string;
    /** i18n key of the value, when it is a word (on, off, none). */
    valueKey?: string;
}

/** The subset the summary reads; everything else in the settings is irrelevant to it. */
export interface SummarySettings {
    ribbonCanvas?: string;
    ai?: { enabled?: boolean; provider?: string };
    cultivateFriction?: boolean;
    hooks?: { properties?: Record<string, unknown> };
    logLevel?: string;
    uniquePrefix?: string;
}

const OFF = "settings_summary_off";
const ON = "settings_summary_on";
const NONE = "settings_summary_none";

/** The name a path is known by — the file, not the folders above it. */
function basename(path: string | undefined): string | undefined {
    if (!path?.trim()) return undefined;
    return (path.split("/").pop() ?? path).replace(/\.canvas$/, "");
}

export function settingsSummary(settings: SummarySettings): SettingsFact[] {
    const create = basename(settings.ribbonCanvas);
    const hooks = Object.keys(settings.hooks?.properties ?? {}).length;
    const level = settings.logLevel ?? "off";

    return [
        {
            labelKey: "settings_summary_create",
            ...(create ? { value: create } : { valueKey: NONE }),
        },
        {
            labelKey: "settings_summary_ai",
            ...(settings.ai?.enabled
                ? { value: settings.ai.provider ?? "" }
                : { valueKey: OFF }),
        },
        {
            // Deliberate friction is on unless someone turned it off (#338).
            labelKey: "settings_summary_friction",
            valueKey: settings.cultivateFriction === false ? OFF : ON,
        },
        {
            labelKey: "settings_summary_hooks",
            ...(hooks > 0 ? { value: String(hooks) } : { valueKey: NONE }),
        },
        {
            labelKey: "settings_summary_logging",
            ...(level === "off" ? { valueKey: OFF } : { value: level }),
        },
    ];
}

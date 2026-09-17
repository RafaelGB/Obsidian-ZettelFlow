/**
 * Settings that were two rows and are one decision (#439, epic #434) — pure.
 *
 * A toggle beside the value it gates is two questions for one answer: *do you want a prefix?* and
 * *which prefix?*, *do you want logs?* and *at which level?*. The value alone says it — an empty
 * pattern is no prefix, a level of `off` is no logging — and the panel loses two rows without
 * losing a capability.
 *
 * Migrating is the whole risk: an install that had a prefix must keep prefixing, and one logging
 * at `debug` must keep logging at `debug`. So this is pure, idempotent and unit-tested, and it
 * runs once on load before anything reads a setting.
 */

/** The level that means "do not log", replacing the separate toggle. */
export const LOG_LEVEL_OFF = "off";

/** The subset this touches; everything else passes through untouched. */
export interface MigratableSettings {
    uniquePrefixEnabled?: boolean;
    uniquePrefix?: string;
    loggerEnabled?: boolean;
    logLevel?: string;
    [key: string]: unknown;
}

export interface SettingsMigration {
    settings: MigratableSettings;
    /** Whether anything changed — the caller only saves when it did. */
    changed: boolean;
}

export function migrateSettings(input: MigratableSettings): SettingsMigration {
    const settings: MigratableSettings = { ...input };
    let changed = false;

    // The prefix: the pattern is the decision; an empty one is "no prefix".
    if ("uniquePrefixEnabled" in settings) {
        if (settings.uniquePrefixEnabled === false) settings.uniquePrefix = "";
        delete settings.uniquePrefixEnabled;
        changed = true;
    }

    // The log level: `off` is a level, so the toggle was a second way to say the same thing.
    if ("loggerEnabled" in settings) {
        if (settings.loggerEnabled === false) settings.logLevel = LOG_LEVEL_OFF;
        else if (!settings.logLevel) settings.logLevel = "info";
        delete settings.loggerEnabled;
        changed = true;
    }

    return { settings, changed };
}

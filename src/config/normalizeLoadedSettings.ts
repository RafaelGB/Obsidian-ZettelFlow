import type { ZettelFlowSettings } from "config/typing";
import { migrateSettings, type MigratableSettings } from "config/settingsMigration";

export interface LoadedSettings {
    settings: ZettelFlowSettings;
    /**
     * Whether what is on disk differs from what was loaded — the only reason to write `data.json`
     * on load (#795). Defaults for keys a file does not have yet are not one: they live in memory
     * and reach the disk with the next real save.
     */
    dirty: boolean;
}

/**
 * What `data.json` said, laid over the defaults and cleaned of what no longer belongs in it — pure.
 *
 * Loading used to rewrite `data.json` on every launch whatever it found: a deep clone of the whole
 * settings and a disk write, and on a synced vault a sync event per device per start. Every step
 * here says whether it changed something, and only then is the file written.
 */
export function normalizeLoadedSettings(
    loaded: Partial<ZettelFlowSettings> | null,
    defaults: Partial<ZettelFlowSettings>
): LoadedSettings {
    // A first run has nothing on disk: writing the defaults once is what makes it an install.
    let dirty = !loaded;
    let settings = Object.assign({}, defaults, loaded ?? {}) as ZettelFlowSettings;

    // Object.assign is shallow — patch nested objects so older saved data that
    // predates a new sub-field still gets the correct default value.
    if (!loaded?.installedTemplates?.steps || !loaded.installedTemplates.actions) dirty = true;
    settings.installedTemplates = {
        steps: loaded?.installedTemplates?.steps ?? {},
        actions: loaded?.installedTemplates?.actions ?? {},
    };

    // Remove clipboard template. This is not a setting that should be saved.
    if (settings.communitySettings && "clipboardTemplate" in settings.communitySettings) {
        delete settings.communitySettings.clipboardTemplate;
        dirty = true;
    }

    // `ai.allowInAutomations` was retired in #337: §XII forbids writing a completion nobody ruled
    // on, and an automation has nobody to ask — so the toggle could only authorise paying for a
    // call that could never be written. Drop the dead key rather than let it sit in data.json
    // forever, quietly implying a switch that no longer exists.
    const ai = settings.ai as unknown as Record<string, unknown> | undefined;
    if (ai && "allowInAutomations" in ai) {
        delete ai.allowInAutomations;
        dirty = true;
    }

    // Two rows that were one decision (#439): the prefix pattern and the log level now say it
    // alone. Migrated here, once, so an install that prefixed keeps prefixing and one logging
    // at debug keeps logging at debug.
    const migrated = migrateSettings(settings as unknown as MigratableSettings);
    if (migrated.changed) {
        settings = migrated.settings as unknown as ZettelFlowSettings;
        dirty = true;
    }
    return { settings, dirty };
}

import { Platform, apiVersion } from "obsidian";
import ZettelFlow from "main";

export const REPO_URL = "https://github.com/RafaelGB/Obsidian-ZettelFlow";
export const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

/**
 * GitHub rejects over-long issue-form prefill URLs (and browsers/servers cap them). Keep the whole
 * URL well under that so a prefilled system JSON either fits or falls back to a file download.
 */
export const MAX_PREFILL_URL = 6000;

/** Build a GitHub "new issue" URL for an issue-form template, prefilling fields by their form `id`. */
export function newIssueUrl(templateFile: string, fields: Record<string, string> = {}): string {
    const params = new URLSearchParams({ template: templateFile, ...fields });
    return `${REPO_URL}/issues/new?${params.toString()}`;
}

/** Map the running platform to one of the bug-report form's Platform options (or undefined). */
export function detectPlatformOption(): string | undefined {
    if (Platform.isAndroidApp) return "Mobile — Android";
    if (Platform.isIosApp) return "Mobile — iOS/iPadOS";
    if (Platform.isMacOS) return "Desktop — macOS";
    if (Platform.isWin) return "Desktop — Windows";
    if (Platform.isLinux) return "Desktop — Linux";
    return undefined;
}

/** Environment fields for the bug-report form — auto-filled so reports arrive diagnosable. */
export function bugReportFields(plugin: ZettelFlow): Record<string, string> {
    const fields: Record<string, string> = {
        plugin_version: plugin.manifest.version,
        obsidian_version: apiVersion,
    };
    const platform = detectPlatformOption();
    if (platform) fields.platform = platform;
    return fields;
}

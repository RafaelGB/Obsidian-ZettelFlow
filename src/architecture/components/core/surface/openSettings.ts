import type { App } from "obsidian";
import type { SectionId } from "config/modals/settingsShell";

/**
 * Open ZettelFlow's settings — on one section when asked (#688). Feature-detected: the tab's
 * `revealSection` is ours, and the settings modal's `openTabById` returns the tab it opened.
 */
export function openZettelFlowSettings(app: App, section?: SectionId): void {
    app.setting.open();
    const tab = app.setting.openTabById("zettelflow") as { revealSection?: (id: SectionId) => void } | null | undefined;
    if (section) tab?.revealSection?.(section);
}

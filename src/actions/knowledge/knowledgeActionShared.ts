import { Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader } from "architecture/api";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import type { KnowledgeActionElement } from "zettelkasten";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Shared plumbing for the #153 🧠 knowledge actions (all `hasUI:false` compute-and-write bundles): a
 * common authoring form (result property + zone + optional target note) and the read-only reader.
 * The execution core (ready-model guard, target resolution, result writing) lives UI-free in
 * `./knowledgeActionCore` and is **re-exported here** so existing importers are unchanged (#264).
 */

// The execution helpers are re-exported so every existing importer keeps its path; the definitions
// live in knowledgeActionCore (no UI import) so the #264 seam/adapter can load without the modal graph.
export { readyModel, resolveTargetPath, writeKnowledgeResult } from "./knowledgeActionCore";

/** Build the `settings`/`settingsReader` pair for a knowledge action from its i18n name/desc keys. */
export function makeKnowledgeSettings(
    nameKey: LocaleKey,
    descKey: LocaleKey
): { settings: ActionSetting; settingsReader: ActionSettingReader } {
    const settings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
        navbarAction(contentEl, t(nameKey), t(descKey), action, modal, disableNavbar);
        knowledgeSettingsForm(contentEl.createDiv(), action, false);
    };
    const settingsReader: ActionSettingReader = (contentEl, action) => {
        knowledgeSettingsForm(contentEl, action, true);
    };
    return { settings, settingsReader };
}

function knowledgeSettingsForm(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as KnowledgeActionElement;

    new Setting(contentEl)
        .setName(t("knowledge_action_property_name"))
        .setDesc(t("knowledge_action_property_desc"))
        .addText((text) =>
            text
                .setValue(el.key ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.key = value;
                })
        );

    new Setting(contentEl)
        .setName(t("knowledge_action_zone_name"))
        .setDesc(t("knowledge_action_zone_desc"))
        .addDropdown((dropdown) =>
            dropdown
                .addOption("frontmatter", t("knowledge_action_zone_frontmatter"))
                .addOption("context", t("knowledge_action_zone_context"))
                .setValue(el.zone ?? "frontmatter")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.zone = value;
                })
        );

    new Setting(contentEl)
        .setName(t("knowledge_action_target_name"))
        .setDesc(t("knowledge_action_target_desc"))
        .addText((text) =>
            text
                .setValue(el.target ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.target = value;
                })
        );
}

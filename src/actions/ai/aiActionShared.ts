import { Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader } from "architecture/api";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import type { AiActionElement } from "zettelkasten";
import { writeKnowledgeResult } from "../knowledge/knowledgeActionShared";

/**
 * Authoring plumbing for the 🤖 AI actions (#156): the settings form (result property + zone) and its
 * read-only reader.
 *
 * The execution core — the gate, the provider call, the §XII **verdict** and the write — lives UI-free
 * in `./aiActionCore` and is **re-exported here** so existing importers are unchanged (same split as
 * `knowledgeActionCore`, #264). That is what lets the write path be unit-tested without the modal graph.
 */

// Re-exported so every existing importer keeps its path; the definitions live in aiActionCore.
export { runAiAction, runAiActionFromPrompt } from "./aiActionCore";
export type { AiActionSpec, AiActionDeps, ProposalReview } from "./aiActionCore";
export { writeKnowledgeResult };

type LocaleKey = Parameters<typeof t>[0];

/** Build the `settings`/`settingsReader` pair for an AI action from its i18n name/desc keys. */
export function makeAiSettings(
    nameKey: LocaleKey,
    descKey: LocaleKey
): { settings: ActionSetting; settingsReader: ActionSettingReader } {
    const settings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
        navbarAction(contentEl, t(nameKey), t(descKey), action, modal, disableNavbar);
        aiSettingsForm(contentEl.createDiv(), action, false);
    };
    const settingsReader: ActionSettingReader = (contentEl, action) => {
        aiSettingsForm(contentEl, action, true);
    };
    return { settings, settingsReader };
}

function aiSettingsForm(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as AiActionElement;

    new Setting(contentEl)
        .setName(t("ai_action_property_name"))
        .setDesc(t("ai_action_property_desc"))
        .addText((text) =>
            text
                .setValue(el.key ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.key = value;
                })
        );

    new Setting(contentEl)
        .setName(t("ai_action_zone_name"))
        .setDesc(t("ai_action_zone_desc"))
        .addDropdown((dropdown) =>
            dropdown
                .addOption("frontmatter", t("ai_action_zone_frontmatter"))
                .addOption("context", t("ai_action_zone_context"))
                .setValue(el.zone ?? "frontmatter")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.zone = value;
                })
        );
}

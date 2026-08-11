import { Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader, ExecuteInfo } from "architecture/api";
import { KnowledgeIndex } from "architecture/knowledge";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import type { KnowledgeActionElement } from "zettelkasten";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Shared plumbing for the #153 🧠 knowledge actions (all `hasUI:false` compute-and-write bundles): a
 * common authoring form (result property + zone + optional target note), the read-only reader, the
 * ready-model guard, target resolution, and result writing. Keeps each action class thin over its
 * pure logic. Deterministic & offline — reads the #145 `KnowledgeIndex`, writes only the result.
 */

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

/** The knowledge model when the index is ready, else `null` (the action then safely no-ops). */
export function readyModel(): KnowledgeModel | null {
    const index = KnowledgeIndex.getInstance();
    if (index.status !== "ready") return null;
    return index.getModel();
}

/** The note to analyze: the configured `target`, else the note being built (may not be indexed yet). */
export function resolveTargetPath(info: ExecuteInfo, el: KnowledgeActionElement): string | null {
    const configured = el.target?.trim();
    if (configured) return configured;
    const building = info.note.getFinalPath();
    return building && building.length > 0 ? building : null;
}

/** Write a knowledge action's result to the configured zone, and always expose it as `{{key}}`. */
export function writeKnowledgeResult(
    info: ExecuteInfo,
    el: KnowledgeActionElement,
    value: unknown
): void {
    const key = el.key;
    if (!key) return;
    if (el.zone !== "context") info.content.addFrontMatter({ [key]: value });
    info.context[key] = value;
}

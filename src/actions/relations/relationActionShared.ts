import { Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader } from "architecture/api";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import { SEMANTIC_RELATION_TYPES } from "architecture/knowledge/relations/vocabulary";
import type { RelationActionElement } from "zettelkasten";
import {
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

/**
 * Shared plumbing for the #154 🔗 relation actions. Two authoring forms — a **ranking** form
 * (result property + zone + optional source note + max results) for find-related / suggest-link,
 * and a **create** form (relation type + target note + zone) for create-semantic-relation — plus a
 * re-export of the #153 model guard / target resolver / result writer so the action classes stay
 * thin over their pure logic. Deterministic and offline.
 */

type LocaleKey = Parameters<typeof t>[0];

// The #153 knowledge helpers are reused as-is (D6) so both categories share one write path.
export { readyModel, resolveTargetPath, writeKnowledgeResult };

const RELATION_TYPE_LABEL_KEYS: Record<string, LocaleKey> = {
    "supports": "relation_type_supports",
    "contradicts": "relation_type_contradicts",
    "expands": "relation_type_expands",
    "inspired-by": "relation_type_inspired_by",
    "question": "relation_type_question",
    "example": "relation_type_example",
    "implements": "relation_type_implements",
};

/** Build the `settings`/`settingsReader` pair for a ranking action (find-related / suggest-link). */
export function makeRelationRankingSettings(
    nameKey: LocaleKey,
    descKey: LocaleKey
): { settings: ActionSetting; settingsReader: ActionSettingReader } {
    const settings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
        navbarAction(contentEl, t(nameKey), t(descKey), action, modal, disableNavbar);
        rankingForm(contentEl.createDiv(), action, false);
    };
    const settingsReader: ActionSettingReader = (contentEl, action) => {
        rankingForm(contentEl, action, true);
    };
    return { settings, settingsReader };
}

/** Build the `settings`/`settingsReader` pair for the create-semantic-relation action. */
export function makeCreateRelationSettings(
    nameKey: LocaleKey,
    descKey: LocaleKey
): { settings: ActionSetting; settingsReader: ActionSettingReader } {
    const settings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
        navbarAction(contentEl, t(nameKey), t(descKey), action, modal, disableNavbar);
        createForm(contentEl.createDiv(), action, false);
    };
    const settingsReader: ActionSettingReader = (contentEl, action) => {
        createForm(contentEl, action, true);
    };
    return { settings, settingsReader };
}

function rankingForm(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as RelationActionElement;

    new Setting(contentEl)
        .setName(t("relation_action_property_name"))
        .setDesc(t("relation_action_property_desc"))
        .addText((text) =>
            text
                .setValue(el.key ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.key = value;
                })
        );

    zoneSetting(contentEl, action, readonly);

    new Setting(contentEl)
        .setName(t("relation_action_source_name"))
        .setDesc(t("relation_action_source_desc"))
        .addText((text) =>
            text
                .setValue(el.target ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.target = value;
                })
        );

    new Setting(contentEl)
        .setName(t("relation_action_limit_name"))
        .setDesc(t("relation_action_limit_desc"))
        .addText((text) =>
            text
                .setValue(el.limit !== undefined ? String(el.limit) : "")
                .setDisabled(readonly)
                .onChange((value) => {
                    const parsed = Math.floor(Number(value));
                    action.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
                })
        );
}

function createForm(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as RelationActionElement;

    new Setting(contentEl)
        .setName(t("relation_action_type_name"))
        .setDesc(t("relation_action_type_desc"))
        .addDropdown((dropdown) => {
            for (const type of SEMANTIC_RELATION_TYPES) {
                dropdown.addOption(type, t(RELATION_TYPE_LABEL_KEYS[type]));
            }
            dropdown
                .setValue(el.relationType ?? SEMANTIC_RELATION_TYPES[0])
                .setDisabled(readonly)
                .onChange((value) => {
                    action.relationType = value;
                });
        });

    new Setting(contentEl)
        .setName(t("relation_action_target_name"))
        .setDesc(t("relation_action_target_desc"))
        .addText((text) =>
            text
                .setValue(el.target ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.target = value;
                })
        );

    zoneSetting(contentEl, action, readonly);
}

function zoneSetting(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as RelationActionElement;
    new Setting(contentEl)
        .setName(t("relation_action_zone_name"))
        .setDesc(t("relation_action_zone_desc"))
        .addDropdown((dropdown) =>
            dropdown
                .addOption("frontmatter", t("relation_action_zone_frontmatter"))
                .addOption("context", t("relation_action_zone_context"))
                .setValue(el.zone ?? "frontmatter")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.zone = value;
                })
        );
}

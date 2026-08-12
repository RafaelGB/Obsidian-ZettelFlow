import { Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader } from "architecture/api";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import type { ResearchActionElement } from "zettelkasten";
import {
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

/**
 * Shared plumbing for the #155 🔍 research actions. Two authoring forms — an **analysis** form
 * (result property + zone + optional source note + optional max-results) for extract-claims /
 * compare-claims / find-sources, and an **attach** form (source value + zone) for attach-source —
 * plus a re-export of the #153 model guard / target resolver / result writer so the action classes
 * stay thin over their pure logic. Deterministic and offline.
 */

type LocaleKey = Parameters<typeof t>[0];

// The #153 knowledge helpers are reused as-is (D6-style) so all categories share one write path.
export { readyModel, resolveTargetPath, writeKnowledgeResult };

/** Build the `settings`/`settingsReader` pair for an analysis action (extract/compare/find). */
export function makeResearchSettings(
    nameKey: LocaleKey,
    descKey: LocaleKey,
    opts: { withLimit?: boolean } = {}
): { settings: ActionSetting; settingsReader: ActionSettingReader } {
    const settings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
        navbarAction(contentEl, t(nameKey), t(descKey), action, modal, disableNavbar);
        analysisForm(contentEl.createDiv(), action, false, opts.withLimit ?? false);
    };
    const settingsReader: ActionSettingReader = (contentEl, action) => {
        analysisForm(contentEl, action, true, opts.withLimit ?? false);
    };
    return { settings, settingsReader };
}

/** Build the `settings`/`settingsReader` pair for the attach-source action. */
export function makeAttachSourceSettings(
    nameKey: LocaleKey,
    descKey: LocaleKey
): { settings: ActionSetting; settingsReader: ActionSettingReader } {
    const settings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
        navbarAction(contentEl, t(nameKey), t(descKey), action, modal, disableNavbar);
        attachForm(contentEl.createDiv(), action, false);
    };
    const settingsReader: ActionSettingReader = (contentEl, action) => {
        attachForm(contentEl, action, true);
    };
    return { settings, settingsReader };
}

function analysisForm(contentEl: HTMLElement, action: Action, readonly: boolean, withLimit: boolean): void {
    const el = action as ResearchActionElement;

    new Setting(contentEl)
        .setName(t("research_action_property_name"))
        .setDesc(t("research_action_property_desc"))
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
        .setName(t("research_action_target_name"))
        .setDesc(t("research_action_target_desc"))
        .addText((text) =>
            text
                .setValue(el.target ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.target = value;
                })
        );

    if (withLimit) {
        new Setting(contentEl)
            .setName(t("research_action_limit_name"))
            .setDesc(t("research_action_limit_desc"))
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
}

function attachForm(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as ResearchActionElement;

    new Setting(contentEl)
        .setName(t("research_action_source_value_name"))
        .setDesc(t("research_action_source_value_desc"))
        .addText((text) =>
            text
                .setValue(el.source ?? "")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.source = value;
                })
        );

    zoneSetting(contentEl, action, readonly);
}

function zoneSetting(contentEl: HTMLElement, action: Action, readonly: boolean): void {
    const el = action as ResearchActionElement;
    new Setting(contentEl)
        .setName(t("research_action_zone_name"))
        .setDesc(t("research_action_zone_desc"))
        .addDropdown((dropdown) =>
            dropdown
                .addOption("frontmatter", t("research_action_zone_frontmatter"))
                .addOption("context", t("research_action_zone_context"))
                .setValue(el.zone ?? "frontmatter")
                .setDisabled(readonly)
                .onChange((value) => {
                    action.zone = value;
                })
        );
}

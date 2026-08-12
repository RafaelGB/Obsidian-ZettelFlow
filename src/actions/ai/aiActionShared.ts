import { Notice, Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import { AiService } from "architecture/ai/AiService";
import type { AiActionElement } from "zettelkasten";
import { resolveTargetPath, writeKnowledgeResult } from "../knowledge/knowledgeActionShared";

/**
 * Shared plumbing for the #156 🤖 AI actions: the authoring form (result property + zone) and the
 * single enabled/config **gate** every AI action runs through. Deterministic control flow; the only
 * network call is delegated to {@link AiService}'s provider. Disabled ⇒ no call. The API key is
 * never touched here or logged.
 */

type LocaleKey = Parameters<typeof t>[0];

// Reused #153 write path so AI results land like every other action's.
export { resolveTargetPath, writeKnowledgeResult };

/** How an AI action turns note content into a prompt, post-processes the completion, and notices. */
export interface AiActionSpec {
    buildPrompt(content: string): string;
    /** Post-process the raw completion before writing (e.g. parse labels/questions). Default: identity. */
    transform?(raw: string): unknown;
    /** Success `Notice` text from the written value. */
    notice(value: unknown): string;
}

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

/**
 * The single gate every AI action runs through (#156, D3/AC-1/AC-2). Off ⇒ `Notice` + `log.debug`,
 * no network. Misconfigured ⇒ `Notice` + `log.error`. Otherwise builds the prompt from the
 * note-being-built content, calls the provider, and on failure degrades to `Notice` + `log.error`
 * (message only, never the key) with no write. On success it writes via the DTO and notices.
 */
export async function runAiAction(
    info: ExecuteInfo,
    el: AiActionElement,
    spec: AiActionSpec
): Promise<void> {
    const service = AiService.getInstance();
    const state = service.gate();
    if (state === "disabled") {
        log.debug("[ai] disabled — skipping");
        new Notice(t("ai_disabled_notice"));
        return;
    }
    if (state === "unconfigured") {
        log.error("[ai] provider not configured — skipping");
        new Notice(t("ai_not_configured_notice"));
        return;
    }

    const prompt = spec.buildPrompt(info.content.get());
    let raw: string;
    try {
        raw = await service.getProvider().complete(prompt);
    } catch (error) {
        log.error(`[ai] request failed: ${error instanceof Error ? error.message : "unknown error"}`);
        new Notice(t("ai_request_failed_notice"));
        return;
    }

    const value = spec.transform ? spec.transform(raw) : raw;
    writeKnowledgeResult(info, el, value);
    new Notice(spec.notice(value));
}

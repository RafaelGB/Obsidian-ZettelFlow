import { Notice, Setting } from "obsidian";
import { Action, ActionSetting, ActionSettingReader, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { navbarAction } from "architecture/components/settings";
import { t } from "architecture/lang";
import { AiService } from "architecture/ai/AiService";
import { aiMaxInputChars, capText } from "architecture/ai/aiGate";
import { sanitizeAiText } from "architecture/ai/promptSafety";
import type { AiActionElement } from "zettelkasten";
import { writeKnowledgeResult } from "../knowledge/knowledgeActionShared";

/**
 * Shared plumbing for the #156 🤖 AI actions: the authoring form (result property + zone) and the
 * single enabled/config **gate** every AI action runs through. Deterministic control flow; the only
 * network call is delegated to {@link AiService}'s provider. Disabled ⇒ no call. The API key is
 * never touched here or logged.
 */

type LocaleKey = Parameters<typeof t>[0];

// Reused #153 write path so AI results land like every other action's.
export { writeKnowledgeResult };

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
    await runAiActionFromPrompt(info, el, spec.buildPrompt(info.content.get()), spec);
}

/**
 * Same gate/call/write path as {@link runAiAction} but for actions that build their prompt themselves
 * (e.g. the multi-note `synthesize` #184, which gathers linked notes in its `execute`). Off ⇒ no
 * network; unconfigured ⇒ Notice; failure ⇒ Notice with nothing written; success ⇒ DTO write + a
 * silent-aware Notice. The prompt is built by the caller so an expensive gather only happens when the
 * caller decides to (callers should still short-circuit before building an empty prompt).
 */
export async function runAiActionFromPrompt(
    info: ExecuteInfo,
    el: AiActionElement,
    prompt: string,
    spec: Pick<AiActionSpec, "transform" | "notice">
): Promise<void> {
    const service = AiService.getInstance();
    const state = service.gate();
    if (state === "disabled") {
        // Silent no-op: these actions auto-run in a flow, so a per-build notice would be noise.
        log.debug("[ai] disabled — skipping");
        return;
    }
    const config = service.config();
    // Automation guard (#301 S2): during a headless on-creation / post-index run, never make a silent
    // network call unless the user has explicitly opted in. AI fires only on a user-driven build.
    if (info.silent && !config.allowInAutomations) {
        log.debug("[ai] automation run — skipping (not allowed in automations)");
        return;
    }
    if (state === "unconfigured") {
        log.error("[ai] provider not configured — skipping");
        new Notice(t("ai_not_configured_notice"));
        return;
    }

    // Bound the payload sent to the model (#301 S1).
    const capped = capText(prompt, aiMaxInputChars(config));

    let raw: string;
    try {
        raw = await service.getProvider().complete(capped);
    } catch (error) {
        log.error(`[ai] request failed: ${error instanceof Error ? error.message : "unknown error"}`);
        new Notice(t("ai_request_failed_notice"));
        return;
    }

    // Sanitise a raw text completion before it lands in a note (#301 S4); parsed (transform) outputs
    // are already structured/validated by their action.
    const value = spec.transform ? spec.transform(raw) : sanitizeAiText(raw);
    writeKnowledgeResult(info, el, value);
    if (!info.silent) new Notice(spec.notice(value)); // suppress in a headless pattern run (#201)
}

import { Notice } from "obsidian";
import { ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { AiService } from "architecture/ai/AiService";
import { aiMaxInputChars, capText } from "architecture/ai/aiGate";
import { sanitizeAiText } from "architecture/ai/promptSafety";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { ProposalModal } from "architecture/components/core/proposal/ProposalModal";
import { JudgementLog, type JudgementEntry } from "architecture/plugin/judgement/JudgementLog";
import type { AiActionElement } from "zettelkasten";
import { writeKnowledgeResult } from "../knowledge/knowledgeActionCore";

/**
 * The **execution core** of the 🤖 AI actions — gate, call, **verdict**, write — decoupled from the
 * authoring UI (`aiActionShared` re-exports these). Same split as `knowledgeActionCore` (#264): no
 * `navbarAction`/`Setting` import here, so the seam loads in a unit test without the modal graph.
 *
 * [Constitution §XII](../../../docs/development/constitution.md) lives here: a completion is a
 * **proposal**, and nothing reaches the note without an explicit human verdict, which is itself
 * recorded (#336). Disabled ⇒ no call. Automations ⇒ no call at all.
 */

/** How an AI action turns note content into a prompt, post-processes the completion, and notices. */
export interface AiActionSpec {
    buildPrompt(content: string): string;
    /** Post-process the reviewed text before writing (e.g. parse labels/questions). Default: identity. */
    transform?(raw: string): unknown;
    /** Success `Notice` text from the written value. */
    notice(value: unknown): string;
}

/** Puts a proposal to the user. Resolves `null` when they dismiss it — a dismissal is not a verdict. */
export type ProposalReview = (proposal: {
    actionId: string;
    text: string;
}) => Promise<{ verdict: "accepted" | "modified" | "rejected"; text: string } | null>;

/** The two collaborators the write path needs, injectable so the real path is testable offline. */
export interface AiActionDeps {
    review: ProposalReview;
    record: (entry: JudgementEntry) => void;
}

const defaultDeps: AiActionDeps = {
    review: ({ actionId, text }) =>
        new ProposalModal(ObsidianApi.globalApp(), actionId, text).ask(),
    record: (entry) => JudgementLog.getInstance().record(entry),
};

/**
 * The single gate + verdict path every AI action runs through (#156, #337). Off ⇒ `Notice` + a debug
 * log, no network. Misconfigured ⇒ `Notice` + `log.error`. Otherwise it builds the prompt from the
 * note being built, calls the provider, and puts the completion to the user as a proposal.
 */
export async function runAiAction(
    info: ExecuteInfo,
    el: AiActionElement,
    spec: AiActionSpec,
    deps: AiActionDeps = defaultDeps
): Promise<void> {
    await runAiActionFromPrompt(info, el, spec.buildPrompt(info.content.get()), spec, deps);
}

/**
 * Same gate/call/verdict/write path as {@link runAiAction} but for actions that build their prompt
 * themselves (e.g. the multi-note `synthesize` #184, which gathers linked notes in its `execute`).
 * The prompt is built by the caller so an expensive gather only happens when the caller decides to.
 */
export async function runAiActionFromPrompt(
    info: ExecuteInfo,
    el: AiActionElement,
    prompt: string,
    spec: Pick<AiActionSpec, "transform" | "notice">,
    deps: AiActionDeps = defaultDeps
): Promise<void> {
    // An automation has nobody to ask for a verdict, and §XII forbids writing without one — so there is
    // nothing a call could achieve except cost. AI runs only on a build you drive yourself (#337).
    if (info.silent) {
        log.debug("[ai] automation run — AI never runs headless");
        return;
    }

    const service = AiService.getInstance();
    const state = service.gate();
    if (state === "disabled") {
        // Silent no-op: these actions auto-run in a flow, so a per-build notice would be noise.
        log.debug("[ai] disabled — skipping");
        return;
    }
    if (state === "unconfigured") {
        log.error("[ai] provider not configured — skipping");
        new Notice(t("ai_not_configured_notice"));
        return;
    }

    // Bound the payload sent to the model (#301 S1).
    const capped = capText(prompt, aiMaxInputChars(service.config()));

    let raw: string;
    try {
        raw = await service.getProvider().complete(capped);
    } catch (error) {
        log.error(`[ai] request failed: ${error instanceof Error ? error.message : "unknown error"}`);
        new Notice(t("ai_request_failed_notice"));
        return;
    }

    // Sanitise before it is even shown (#301 S4): what the user reviews is exactly what would land.
    const proposed = sanitizeAiText(raw);
    const outcome = await deps.review({ actionId: el.type, text: proposed });
    if (!outcome) return; // dismissed — nothing written, nothing recorded

    const path = info.note.getFinalPath();
    if (path) {
        deps.record({ path, subject: el.type, origin: "ai", verdict: outcome.verdict });
    }
    if (outcome.verdict === "rejected") return;

    // The reviewed text is the unit of decision, so an edited proposal is parsed like an accepted one.
    const value = spec.transform ? spec.transform(outcome.text) : outcome.text;
    writeKnowledgeResult(info, el, value);
    new Notice(spec.notice(value));
}

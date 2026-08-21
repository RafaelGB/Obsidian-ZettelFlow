import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { KnowledgeActionElement } from "zettelkasten";
import { PromptToken, criticalThinkingPrompts } from "./thinkingSimulatorLogic";
import {
    makeKnowledgeSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

type LocaleKey = Parameters<typeof t>[0];

/** Each token maps to a sentence-case, localized critical-thinking question at the edge (#165). */
const PROMPT_LABELS: Record<PromptToken, LocaleKey> = {
    "assume-false": "knowledge_thinking_prompt_assume_false",
    "who-disagrees": "knowledge_thinking_prompt_who_disagrees",
    "extreme-case": "knowledge_thinking_prompt_extreme_case",
    "hidden-assumption": "knowledge_thinking_prompt_hidden_assumption",
    "needs-evidence": "knowledge_thinking_prompt_needs_evidence",
    "needs-counterpoint": "knowledge_thinking_prompt_needs_counterpoint",
    "needs-example": "knowledge_thinking_prompt_needs_example",
    "needs-connection": "knowledge_thinking_prompt_needs_connection",
    "needs-question": "knowledge_thinking_prompt_needs_question",
};

const { settings, settingsReader } = makeKnowledgeSettings(
    "knowledge_action_thinking_label",
    "knowledge_action_thinking_desc"
);

/** 🧠 Challenges the note with critical-thinking prompts adapted to its gaps (#165). Deterministic/offline. */
export class ThinkingSimulatorAction extends CustomZettelAction {
    private static ICON = "brain-circuit";
    id = "thinking-simulator";
    category = "knowledge" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "thinkingPrompts", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/ThinkingSimulator";
    get purpose(): string {
        return t("thinking_simulator_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as KnowledgeActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[thinking-simulator] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[thinking-simulator] no target note — skipping");
            return;
        }
        const prompts = criticalThinkingPrompts(model, path);
        const value = prompts.map((prompt) => t(PROMPT_LABELS[prompt]));
        writeKnowledgeResult(info, el, value);
        if (!info.silent) new Notice(t("knowledge_thinking_notice", String(prompts.length)));
    }

    getIcon(): string {
        return ThinkingSimulatorAction.ICON;
    }

    getLabel(): string {
        return t("knowledge_action_thinking_label");
    }
}

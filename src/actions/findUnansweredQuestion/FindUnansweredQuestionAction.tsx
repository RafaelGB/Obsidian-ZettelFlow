import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { KnowledgeActionElement } from "zettelkasten";
import { findUnansweredQuestions } from "./findUnansweredQuestionLogic";
import {
    makeKnowledgeSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

const { settings, settingsReader } = makeKnowledgeSettings(
    "knowledge_action_unanswered_label",
    "knowledge_action_unanswered_desc"
);

/** 🧠 Lists the open questions a note raises that nothing answers yet (question/supports, #147). #153. */
export class FindUnansweredQuestionAction extends CustomZettelAction {
    private static ICON = "circle-help";
    id = "find-unanswered-question";
    category = "knowledge" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "unanswered-questions", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/FindUnansweredQuestion";
    purpose = "List questions this note raises that nothing answers yet.";

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as KnowledgeActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[find-unanswered-question] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[find-unanswered-question] no target note — skipping");
            return;
        }
        const questions = findUnansweredQuestions(model, path);
        writeKnowledgeResult(info, el, questions.map((p) => `[[${p.replace(/\.md$/i, "")}]]`));
        new Notice(t("knowledge_find_unanswered_question_notice", String(questions.length)));
    }

    getIcon(): string {
        return FindUnansweredQuestionAction.ICON;
    }

    getLabel(): string {
        return t("knowledge_action_unanswered_label");
    }
}

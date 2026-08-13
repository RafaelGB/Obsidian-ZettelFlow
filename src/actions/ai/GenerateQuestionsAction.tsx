import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { t } from "architecture/lang";
import { AiActionElement } from "zettelkasten";
import { buildQuestionsPrompt, parseQuestions } from "./generateQuestionsLogic";
import { makeAiSettings, runAiAction } from "./aiActionShared";

const { settings, settingsReader } = makeAiSettings(
    "ai_generate_questions_label",
    "ai_generate_questions_desc"
);

/** 🤖 Generates the open questions the note being built raises, via the AI provider (opt-in). #156. */
export class GenerateQuestionsAction extends CustomZettelAction {
    private static ICON = "help-circle";
    id = "generate-questions";
    category = "ai" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "questions", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/GenerateQuestions";
    get purpose(): string {
        return t("generate_questions_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as AiActionElement;
        await runAiAction(info, el, {
            buildPrompt: buildQuestionsPrompt,
            transform: (raw) => parseQuestions(raw),
            notice: (value) => t("ai_generate_questions_notice", String((value as string[]).length)),
        });
    }

    getIcon(): string {
        return GenerateQuestionsAction.ICON;
    }

    getLabel(): string {
        return t("ai_generate_questions_label");
    }
}

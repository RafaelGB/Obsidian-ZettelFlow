import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { t } from "architecture/lang";
import { AiActionElement } from "zettelkasten";
import { buildClassifyPrompt, parseClassification } from "./classifyLogic";
import { makeAiSettings, runAiAction } from "./aiActionShared";

const { settings, settingsReader } = makeAiSettings("ai_classify_label", "ai_classify_desc");

/** 🤖 Suggests topic tags for the note being built via the configured AI provider (opt-in). #156. */
export class ClassifyAction extends CustomZettelAction {
    private static ICON = "tags";
    id = "classify";
    category = "ai" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "classification", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Classify";
    get purpose(): string {
        return t("classify_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as AiActionElement;
        await runAiAction(info, el, {
            buildPrompt: buildClassifyPrompt,
            transform: (raw) => parseClassification(raw),
            notice: (value) => t("ai_classify_notice", String((value as string[]).length)),
        });
    }

    getIcon(): string {
        return ClassifyAction.ICON;
    }

    getLabel(): string {
        return t("ai_classify_label");
    }
}

import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { t } from "architecture/lang";
import { AiActionElement } from "zettelkasten";
import { buildSummarizePrompt } from "./summarizeLogic";
import { makeAiSettings, runAiAction } from "./aiActionShared";

const { settings, settingsReader } = makeAiSettings("ai_summarize_label", "ai_summarize_desc");

/** 🤖 Summarizes the note being built via the configured AI provider (opt-in, off by default). #156. */
export class SummarizeAction extends CustomZettelAction {
    private static ICON = "sparkles";
    id = "summarize";
    category = "ai" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "summary", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Summarize";
    get purpose(): string {
        return t("summarize_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as AiActionElement;
        await runAiAction(info, el, {
            buildPrompt: buildSummarizePrompt,
            notice: () => t("ai_summarize_notice"),
        });
    }

    getIcon(): string {
        return SummarizeAction.ICON;
    }

    getLabel(): string {
        return t("ai_summarize_label");
    }
}

import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { t } from "architecture/lang";
import { AiActionElement } from "zettelkasten";
import { buildConnectionsPrompt, parseConnections } from "./suggestConnectionsLogic";
import { makeAiSettings, runAiAction } from "./aiActionShared";

const { settings, settingsReader } = makeAiSettings(
    "ai_suggest_connections_label",
    "ai_suggest_connections_desc"
);

/**
 * 🤖 The AI counterpart to the deterministic 🔗 `suggest-link` (#154): the model proposes notes worth
 * linking from the note being built, via the AI provider (opt-in, off by default). #184.
 */
export class SuggestConnectionsAction extends CustomZettelAction {
    private static ICON = "spline";
    id = "suggest-connections";
    category = "ai" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "suggestedConnections", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/SuggestConnections";
    get purpose(): string {
        return t("suggest_connections_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as AiActionElement;
        await runAiAction(info, el, {
            buildPrompt: buildConnectionsPrompt,
            transform: (raw) => parseConnections(raw),
            notice: (value) => t("ai_suggest_connections_notice", String((value as string[]).length)),
        });
    }

    getIcon(): string {
        return SuggestConnectionsAction.ICON;
    }

    getLabel(): string {
        return t("ai_suggest_connections_label");
    }
}

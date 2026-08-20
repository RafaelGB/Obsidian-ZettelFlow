import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { t } from "architecture/lang";
import { AiActionElement } from "zettelkasten";
import { buildChallengePrompt } from "./challengeIdeaLogic";
import { makeAiSettings, runAiAction } from "./aiActionShared";

const { settings, settingsReader } = makeAiSettings("ai_challenge_idea_label", "ai_challenge_idea_desc");

/** 🤖 Argues against the note's thesis to surface its weakest points, via the AI provider (opt-in). #184. */
export class ChallengeIdeaAction extends CustomZettelAction {
    private static ICON = "swords";
    id = "challenge-idea";
    category = "ai" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "challenge", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/ChallengeIdea";
    get purpose(): string {
        return t("challenge_idea_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as AiActionElement;
        await runAiAction(info, el, {
            buildPrompt: buildChallengePrompt,
            notice: () => t("ai_challenge_idea_notice"),
        });
    }

    getIcon(): string {
        return ChallengeIdeaAction.ICON;
    }

    getLabel(): string {
        return t("ai_challenge_idea_label");
    }
}

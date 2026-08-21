import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { RelationActionElement } from "zettelkasten";
import { rankRelated } from "architecture/knowledge/relations/relationRankingLogic";
import {
    makeRelationRankingSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../relations/relationActionShared";

const DEFAULT_LIMIT = 5;

const { settings, settingsReader } = makeRelationRankingSettings(
    "relation_suggest_link_label",
    "relation_suggest_link_desc"
);

/** 🔗 Surfaces the top link suggestions for a note from shared graph context. #154. */
export class SuggestLinkAction extends CustomZettelAction {
    private static ICON = "link";
    id = "suggest-link";
    category = "relations" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "suggestedLinks", zone: "frontmatter", limit: DEFAULT_LIMIT };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/SuggestLink";
    get purpose(): string {
        return t("suggest_link_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as RelationActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[suggest-link] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[suggest-link] no source note — skipping");
            return;
        }
        const suggestions = rankRelated(model, path, { limit: el.limit ?? DEFAULT_LIMIT });
        writeKnowledgeResult(info, el, suggestions.map((p) => `[[${p.replace(/\.md$/i, "")}]]`));
        if (!info.silent) new Notice(t("relation_suggest_link_notice", String(suggestions.length)));
    }

    getIcon(): string {
        return SuggestLinkAction.ICON;
    }

    getLabel(): string {
        return t("relation_suggest_link_label");
    }
}

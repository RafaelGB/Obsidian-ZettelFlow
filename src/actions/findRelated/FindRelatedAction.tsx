import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { RelationActionElement } from "zettelkasten";
import { rankRelated } from "../relations/relationRankingLogic";
import {
    makeRelationRankingSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../relations/relationActionShared";

const DEFAULT_LIMIT = 10;

const { settings, settingsReader } = makeRelationRankingSettings(
    "relation_find_related_label",
    "relation_find_related_desc"
);

/** 🔗 Ranks notes worth linking by shared graph context (co-citation + coupling). #154. */
export class FindRelatedAction extends CustomZettelAction {
    private static ICON = "share-2";
    id = "find-related";
    category = "relations" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "related", zone: "frontmatter", limit: DEFAULT_LIMIT };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/FindRelated";
    get purpose(): string {
        return t("find_related_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as RelationActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[find-related] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[find-related] no source note — skipping");
            return;
        }
        const related = rankRelated(model, path, { limit: el.limit ?? DEFAULT_LIMIT });
        writeKnowledgeResult(info, el, related.map((p) => `[[${p.replace(/\.md$/i, "")}]]`));
        if (!info.silent) new Notice(t("relation_find_related_notice", String(related.length)));
    }

    getIcon(): string {
        return FindRelatedAction.ICON;
    }

    getLabel(): string {
        return t("relation_find_related_label");
    }
}

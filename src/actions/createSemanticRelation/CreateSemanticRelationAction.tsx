import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { RelationActionElement } from "zettelkasten";
import { SEMANTIC_RELATION_TYPES } from "architecture/knowledge/relations/vocabulary";
import { semanticRelationField } from "./createSemanticRelationLogic";
import { makeCreateRelationSettings, writeKnowledgeResult } from "../relations/relationActionShared";

const { settings, settingsReader } = makeCreateRelationSettings(
    "relation_create_relation_label",
    "relation_create_relation_desc"
);

/**
 * 🔗 Writes a typed semantic relation (#147 vocabulary) from the note being built to a target note,
 * as a frontmatter field the knowledge model indexes on re-index. Empty/invalid ⇒ safe no-op. #154.
 */
export class CreateSemanticRelationAction extends CustomZettelAction {
    private static ICON = "waypoints";
    id = "create-semantic-relation";
    category = "relations" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, relationType: SEMANTIC_RELATION_TYPES[0], target: "", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/CreateSemanticRelation";
    purpose = "Write a typed relation from this note to a target note.";

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as RelationActionElement;
        const field = semanticRelationField(el.relationType ?? "", el.target ?? "");
        if (!field) {
            log.debug("[create-semantic-relation] no valid relation type/target — skipping");
            return;
        }
        writeKnowledgeResult(info, { ...el, key: field.key }, field.value);
        new Notice(t("relation_create_relation_notice", field.key));
    }

    getIcon(): string {
        return CreateSemanticRelationAction.ICON;
    }

    getLabel(): string {
        return t("relation_create_relation_label");
    }
}

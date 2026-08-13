import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { KnowledgeActionElement } from "zettelkasten";
import { findContradictions } from "./findContradictionLogic";
import {
    makeKnowledgeSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

const { settings, settingsReader } = makeKnowledgeSettings(
    "knowledge_action_contradiction_label",
    "knowledge_action_contradiction_desc"
);

/** 🧠 Lists notes that contradict the target via a `contradicts` relation (#147). #153. */
export class FindContradictionAction extends CustomZettelAction {
    private static ICON = "swords";
    id = "find-contradiction";
    category = "knowledge" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "contradictions", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/FindContradiction";
    purpose = "List notes that contradict this one (via a contradicts relation).";

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as KnowledgeActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[find-contradiction] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[find-contradiction] no target note — skipping");
            return;
        }
        const contradictions = findContradictions(model, path);
        writeKnowledgeResult(info, el, contradictions.map((p) => `[[${p.replace(/\.md$/i, "")}]]`));
        if (!info.silent) new Notice(t("knowledge_find_contradiction_notice", String(contradictions.length)));
    }

    getIcon(): string {
        return FindContradictionAction.ICON;
    }

    getLabel(): string {
        return t("knowledge_action_contradiction_label");
    }
}

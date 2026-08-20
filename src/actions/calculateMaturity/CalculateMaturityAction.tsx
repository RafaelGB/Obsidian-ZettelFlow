import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeActionElement } from "zettelkasten";
import { computeMaturity } from "./maturityLogic";
import {
    makeKnowledgeSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

const { settings, settingsReader } = makeKnowledgeSettings(
    "knowledge_action_maturity_label",
    "knowledge_action_maturity_desc"
);

/** 🧠 Scores note maturity 0–100 from state, links, sources and age. Feeds #158. #153. */
export class CalculateMaturityAction extends CustomZettelAction {
    private static ICON = "gauge";
    id = "calculate-maturity";
    category = "knowledge" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "maturity", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/CalculateMaturity";
    get purpose(): string {
        return t("calculate_maturity_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as KnowledgeActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[calculate-maturity] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[calculate-maturity] no target note — skipping");
            return;
        }
        const result = computeMaturity(model, path, Date.now());
        if (result === null) {
            log.debug(`[calculate-maturity] "${path}" not indexed — skipping`);
            return;
        }
        writeKnowledgeResult(info, el, result);
    }

    getIcon(): string {
        return CalculateMaturityAction.ICON;
    }

    getLabel(): string {
        return t("knowledge_action_maturity_label");
    }
}

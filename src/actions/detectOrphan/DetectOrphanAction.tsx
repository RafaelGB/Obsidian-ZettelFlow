import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeActionElement } from "zettelkasten";
import { computeIsOrphan } from "./detectOrphanLogic";
import {
    makeKnowledgeSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

const { settings, settingsReader } = makeKnowledgeSettings(
    "knowledge_action_orphan_label",
    "knowledge_action_orphan_desc"
);

/** 🧠 Flags whether the target note is an orphan (no links in or out). #153, deterministic/offline. */
export class DetectOrphanAction extends CustomZettelAction {
    private static ICON = "unlink";
    id = "detect-orphan";
    category = "knowledge" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "orphan", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/DetectOrphan";
    get purpose(): string {
        return t("detect_orphan_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as KnowledgeActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[detect-orphan] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[detect-orphan] no target note — skipping");
            return;
        }
        const result = computeIsOrphan(model, path);
        if (result === null) {
            log.debug(`[detect-orphan] "${path}" not indexed — skipping`);
            return;
        }
        writeKnowledgeResult(info, el, result);
    }

    getIcon(): string {
        return DetectOrphanAction.ICON;
    }

    getLabel(): string {
        return t("knowledge_action_orphan_label");
    }
}

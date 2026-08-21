import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { KnowledgeActionElement } from "zettelkasten";
import { NextMoveToken, suggestNextMoves } from "./nextMoveLogic";
import {
    makeKnowledgeSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../knowledge/knowledgeActionShared";

type LocaleKey = Parameters<typeof t>[0];

/** Each token maps to a sentence-case, localized "do this next" string at the edge (#158, D-d). */
const MOVE_LABELS: Record<NextMoveToken, LocaleKey> = {
    "add-source": "knowledge_next_move_add_source",
    "connect": "knowledge_next_move_connect",
    "add-example": "knowledge_next_move_add_example",
    "advance-state": "knowledge_next_move_advance_state",
};

const { settings, settingsReader } = makeKnowledgeSettings(
    "knowledge_action_next_move_label",
    "knowledge_action_next_move_desc"
);

/** 🧠 Proposes the most useful next moves to develop the note (#158). Deterministic/offline. */
export class SuggestNextMoveAction extends CustomZettelAction {
    private static ICON = "compass";
    id = "suggest-next-move";
    category = "knowledge" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "nextMoves", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/SuggestNextMove";
    get purpose(): string {
        return t("suggest_next_move_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as KnowledgeActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[suggest-next-move] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[suggest-next-move] no target note — skipping");
            return;
        }
        const moves = suggestNextMoves(model, path);
        const value = moves.length > 0
            ? moves.map((move) => t(MOVE_LABELS[move]))
            : [t("knowledge_next_move_complete")];
        writeKnowledgeResult(info, el, value);
        if (!info.silent) new Notice(
            moves.length > 0
                ? t("knowledge_next_move_notice", String(moves.length))
                : t("knowledge_next_move_complete")
        );
    }

    getIcon(): string {
        return SuggestNextMoveAction.ICON;
    }

    getLabel(): string {
        return t("knowledge_action_next_move_label");
    }
}

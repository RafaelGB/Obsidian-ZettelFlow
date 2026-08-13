import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { ResearchActionElement } from "zettelkasten";
import { serializeClaims } from "./extractClaimsLogic";
import {
    makeResearchSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../research/researchActionShared";

const { settings, settingsReader } = makeResearchSettings(
    "research_extract_claims_label",
    "research_extract_claims_desc"
);

/** 🔍 Surfaces the claims (and their sources) a note declares, via ClaimSourceSchema. #155. */
export class ExtractClaimsAction extends CustomZettelAction {
    private static ICON = "quote";
    id = "extract-claims";
    category = "research" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "claims", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/ExtractClaims";
    get purpose(): string {
        return t("extract_claims_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as ResearchActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[extract-claims] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[extract-claims] no target note — skipping");
            return;
        }
        const idea = model.get(path);
        if (!idea) {
            log.debug(`[extract-claims] "${path}" not indexed — skipping`);
            return;
        }
        const serialized = serializeClaims(idea.claims);
        writeKnowledgeResult(info, el, serialized);
        if (!info.silent) new Notice(t("research_extract_claims_notice", String(serialized.claim.length)));
    }

    getIcon(): string {
        return ExtractClaimsAction.ICON;
    }

    getLabel(): string {
        return t("research_extract_claims_label");
    }
}

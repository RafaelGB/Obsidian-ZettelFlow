import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { ResearchActionElement } from "zettelkasten";
import { compareClaims, ClaimMatch } from "./compareClaimsLogic";
import {
    makeResearchSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../research/researchActionShared";

const { settings, settingsReader } = makeResearchSettings(
    "research_compare_claims_label",
    "research_compare_claims_desc"
);

/** 🔍 Surfaces notes whose claims agree with or contradict this note's claims. #155, deterministic/offline. */
export class CompareClaimsAction extends CustomZettelAction {
    private static ICON = "scale";
    id = "compare-claims";
    category = "research" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "claimComparison", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/CompareClaims";
    purpose = "Find notes whose claims agree with or contradict this note's claims.";

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as ResearchActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[compare-claims] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[compare-claims] no target note — skipping");
            return;
        }
        const { agreeing, contradicting } = compareClaims(model, path);
        const agreeingLinks = toNoteLinks(agreeing);
        const contradictingLinks = toNoteLinks(contradicting);
        writeKnowledgeResult(info, el, { agreeing: agreeingLinks, contradicting: contradictingLinks });
        new Notice(
            t("research_compare_claims_notice", String(agreeingLinks.length), String(contradictingLinks.length))
        );
    }

    getIcon(): string {
        return CompareClaimsAction.ICON;
    }

    getLabel(): string {
        return t("research_compare_claims_label");
    }
}

/** Dedupe claim matches to one extensionless `[[wikilink]]` per note, preserving path order. */
function toNoteLinks(matches: ClaimMatch[]): string[] {
    const seen = new Set<string>();
    const links: string[] = [];
    for (const match of matches) {
        if (seen.has(match.path)) continue;
        seen.add(match.path);
        links.push(`[[${match.path.replace(/\.md$/i, "")}]]`);
    }
    return links;
}

import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { ResearchActionElement } from "zettelkasten";
import type { Source } from "architecture/knowledge/model/Idea";
import { findSources } from "./findSourcesLogic";
import {
    makeResearchSettings,
    readyModel,
    resolveTargetPath,
    writeKnowledgeResult,
} from "../research/researchActionShared";

const DEFAULT_LIMIT = 5;

const { settings, settingsReader } = makeResearchSettings(
    "research_find_sources_label",
    "research_find_sources_desc",
    { withLimit: true }
);

/** 🔍 Suggests existing vault sources for an under-sourced note (offline, read-only). #155. */
export class FindSourcesAction extends CustomZettelAction {
    private static ICON = "book-marked";
    id = "find-sources";
    category = "research" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "candidateSources", zone: "frontmatter", limit: DEFAULT_LIMIT };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/FindSources";
    purpose = "Suggest existing vault sources for an under-sourced note.";

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as ResearchActionElement;
        const model = readyModel();
        if (!model) {
            log.debug("[find-sources] knowledge index not ready — skipping");
            return;
        }
        const path = resolveTargetPath(info, el);
        if (!path) {
            log.debug("[find-sources] no target note — skipping");
            return;
        }
        const candidates = findSources(model, path, { limit: el.limit ?? DEFAULT_LIMIT });
        writeKnowledgeResult(info, el, candidates.map(sourceToken));
        if (!info.silent) new Notice(t("research_find_sources_notice", String(candidates.length)));
    }

    getIcon(): string {
        return FindSourcesAction.ICON;
    }

    getLabel(): string {
        return t("research_find_sources_label");
    }
}

/** A link source becomes an extensionless `[[wikilink]]`; free text is kept verbatim. */
function sourceToken(source: Source): string {
    if (source.kind !== "link") return source.ref;
    const file = source.ref.split("/").pop() ?? source.ref;
    return `[[${file.replace(/\.md$/i, "")}]]`;
}

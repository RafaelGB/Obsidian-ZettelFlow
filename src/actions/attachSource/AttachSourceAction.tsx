import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { ResearchActionElement } from "zettelkasten";
import { sourceField } from "./attachSourceLogic";
import { makeAttachSourceSettings, writeKnowledgeResult } from "../research/researchActionShared";

const { settings, settingsReader } = makeAttachSourceSettings(
    "research_attach_source_label",
    "research_attach_source_desc"
);

/** 🔍 Attaches a source (wikilink or free text) to the note being built, so the model sources it. #155. */
export class AttachSourceAction extends CustomZettelAction {
    private static ICON = "paperclip";
    id = "attach-source";
    category = "research" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, source: "", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/AttachSource";
    get purpose(): string {
        return t("attach_source_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as ResearchActionElement;
        const field = sourceField(el.source ?? "");
        if (!field) {
            log.debug("[attach-source] no source value — skipping");
            return;
        }
        writeKnowledgeResult(info, { ...el, key: field.key }, field.value);
        if (!info.silent) new Notice(t("research_attach_source_notice", field.value));
    }

    getIcon(): string {
        return AttachSourceAction.ICON;
    }

    getLabel(): string {
        return t("research_attach_source_label");
    }
}

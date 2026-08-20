import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { AiActionElement } from "zettelkasten";
import { FileService } from "architecture/plugin";
import { TFile } from "obsidian";
import { buildSynthesisPrompt, extractWikilinks, SynthesisSource } from "./synthesizeLogic";
import { makeAiSettings, runAiActionFromPrompt } from "./aiActionShared";

const MAX_SOURCES = 5;
const { settings, settingsReader } = makeAiSettings("ai_synthesize_label", "ai_synthesize_desc");

/**
 * 🤖 Synthesizes the notes linked (`[[wikilinks]]`) from the note being built into one summary, via
 * the AI provider (opt-in, off by default). Reads — never mutates — up to five linked notes and sends
 * their content plus the note being built to the configured endpoint. #184.
 */
export class SynthesizeAction extends CustomZettelAction {
    private static ICON = "combine";
    id = "synthesize";
    category = "ai" as const;
    kind = "query" as const;
    defaultAction: Action = { type: this.id, hasUI: false, id: this.id, key: "synthesis", zone: "frontmatter" };
    settings = settings;
    settingsReader = settingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Synthesize";
    get purpose(): string {
        return t("synthesize_purpose");
    }

    async execute(info: ExecuteInfo) {
        const el = info.element as unknown as AiActionElement;
        const sources = await this.gatherSources(info);
        if (sources.length === 0) {
            log.debug("[synthesize] no linked notes resolved — skipping");
            return;
        }
        await runAiActionFromPrompt(info, el, buildSynthesisPrompt(sources), {
            notice: () => t("ai_synthesize_notice", String(sources.length)),
        });
    }

    /** Resolve the note's `[[wikilinks]]` to files and read their content (capped, best-effort). */
    private async gatherSources(info: ExecuteInfo): Promise<SynthesisSource[]> {
        const sourcePath = info.note.getFinalPath() ?? "";
        const sources: SynthesisSource[] = [];
        for (const name of extractWikilinks(info.content.get())) {
            if (sources.length >= MAX_SOURCES) break;
            const dest = ObsidianApi.metadataCache().getFirstLinkpathDest(name, sourcePath);
            if (!(dest instanceof TFile)) continue;
            try {
                sources.push({ title: dest.basename, content: await FileService.getContent(dest) });
            } catch (error) {
                log.debug(`[synthesize] could not read "${dest.path}": ${error instanceof Error ? error.message : "unknown error"}`);
            }
        }
        return sources;
    }

    getIcon(): string {
        return SynthesizeAction.ICON;
    }

    getLabel(): string {
        return t("ai_synthesize_label");
    }
}

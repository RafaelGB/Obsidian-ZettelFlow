import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { zettelIdSettings } from "./ZettelIdSettings";
import { zettelIdSettingsReader } from "./ZettelIdSettingsReader";
import { ObsidianApi, log } from "architecture";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { ZettelIdElement } from "zettelkasten";
import {
    formatTimestamp,
    nextChildId,
    nextSiblingId,
    nextRootId,
} from "./zettelIdLogic";
import { Action } from "architecture/api";

export class ZettelIdAction extends CustomZettelAction {
    private static ICON = "fingerprint";
    id = "zettel-id";
    category = "manipulation" as const;
    defaultAction: Action = {
        type: this.id,
        hasUI: false,
        id: this.id,
        strategy: "timestamp",
        key: "id",
        writeFrontmatter: true,
        writeFilename: false,
        timestampFormat: "YYYYMMDDHHmm",
        relationship: "child",
    };
    settings = zettelIdSettings;
    settingsReader = zettelIdSettingsReader;
    link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/ZettelId";
    get purpose(): string {
        return t("zettel_id_purpose");
    }

    async execute(info: ExecuteInfo) {
        const { content, note, element } = info;
        const el = element as unknown as ZettelIdElement;
        const {
            strategy = "timestamp",
            key = "id",
            writeFrontmatter = true,
            writeFilename = false,
            timestampFormat = "YYYYMMDDHHmm",
            parent,
            relationship = "child",
        } = el;

        // Gather existing IDs once (single snapshot)
        const existingIds = new Set<string>(
            ObsidianApi.metadataCache().getFrontmatterPropertyValuesForKey(key)
        );

        let generatedId: string;
        let usedFallback = false;

        if (strategy === "timestamp") {
            generatedId = formatTimestamp(timestampFormat);
            log.debug(`[ZettelId] timestamp strategy, id="${generatedId}"`);
        } else {
            // Folgezettel
            if (!parent) {
                generatedId = nextRootId(existingIds);
                usedFallback = true;
                new Notice(t("zettel_id_no_parent_fallback_notice"));
                log.debug(`[ZettelId] folgezettel no-parent fallback, id="${generatedId}"`);
            } else if (relationship === "child") {
                generatedId = nextChildId(parent, existingIds);
                log.debug(`[ZettelId] folgezettel child of "${parent}", id="${generatedId}"`);
            } else {
                generatedId = nextSiblingId(parent, existingIds);
                log.debug(`[ZettelId] folgezettel sibling of "${parent}", id="${generatedId}"`);
            }

            // Notice if collision forced us past first candidate
            if (!usedFallback) {
                const firstCandidate = relationship === "child"
                    ? nextChildId(parent!, new Set())
                    : nextSiblingId(parent!, new Set());
                if (firstCandidate !== generatedId) {
                    new Notice(t("zettel_id_collision_advance_notice"));
                }
            }
        }

        // Write to frontmatter
        if (writeFrontmatter) {
            content.addFrontMatter({ [key]: generatedId });
        }

        // Write to filename (prefix the title)
        if (writeFilename) {
            const currentTitle = note.getTitle();
            note.setTitle(`${generatedId} ${currentTitle}`);
        }

        // Make substitutable via {{key}} in body/context
        info.context[key] = generatedId;
    }

    getIcon() {
        return ZettelIdAction.ICON;
    }

    getLabel() {
        return t("type_option_zettel_id");
    }
}

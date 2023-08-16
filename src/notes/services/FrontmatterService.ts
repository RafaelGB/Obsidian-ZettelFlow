import { ObsidianApi, log } from "architecture";
import { FinalNoteInfo } from "../model/FinalNoteModel";
import { TFile } from "obsidian";

class FrontMatterServiceManager {
    private static instance: FrontMatterServiceManager;
    public async processFrontMatter(file: TFile, info: FinalNoteInfo) {
        await ObsidianApi.fileManager().processFrontMatter(file, (frontmatter) => {
            if (info.tags.length > 0) {
                frontmatter.tags = info.tags;
            }
            frontmatter = {
                ...frontmatter,
                ...info.frontmatter
            };
            log.debug(`Frontmatter: ${JSON.stringify(frontmatter)}`);
        });
    }

    public static getInstance(): FrontMatterServiceManager {
        if (!FrontMatterServiceManager.instance) {
            FrontMatterServiceManager.instance = new FrontMatterServiceManager();
        }
        return FrontMatterServiceManager.instance;
    }
}

export const FrontMatterService = FrontMatterServiceManager.getInstance();


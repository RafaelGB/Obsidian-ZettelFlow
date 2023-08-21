import { ObsidianApi } from "architecture";
import { TFile } from "obsidian";
import { Literal } from "../model/FrontmatterModel";
export class FrontmatterService {
    public static containsProperty(file: TFile, property: string, value?: Literal): boolean {
        const metadata = ObsidianApi.metadataCache().getFileCache(file);
        if (!metadata || !metadata.frontmatter) {
            return false;
        }

        if (value) {
            return metadata.frontmatter[property] === value;
        }

        return metadata.frontmatter[property] !== undefined;
    }
}
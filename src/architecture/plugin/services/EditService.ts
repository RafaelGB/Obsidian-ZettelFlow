import { ObsidianApi } from "architecture";
import { CachedMetadata, HeadingCache, TFile } from "obsidian";

export class EditService {
    content: string;
    metadata: CachedMetadata;
    public static instance(file: TFile | null) {
        if (!file) {
            throw new Error("File is null");
        }

        return new EditService(file);
    }

    constructor(private file: TFile) {
        const potentialMetadata = ObsidianApi.metadataCache().getFileCache(file);
        if (!potentialMetadata) {
            this.metadata = {
                frontmatter: {}
            }
        } else {
            this.metadata = potentialMetadata;
        }
    }
    setContent(content: string) {
        this.content = content;
        return this;
    }
    /**
     * 
     * @param file Target file
     * @param heading Heading to insert backlink below
     */
    insertBacklink(mdLink: string, heading: HeadingCache) {
        const { end } = heading.position;
        // Insert at the end of the heading line
        this.content = this.content.substring(0, end.offset) + mdLink + this.content.substring(end.offset);
        return this;
    }

    async save() {
        await ObsidianApi.vault().modify(this.file, this.content);
    }
}
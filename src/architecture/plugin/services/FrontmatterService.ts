import { ObsidianApi, log } from "architecture";
import { CachedMetadata, TFile } from "obsidian";
import { Literal } from "../model/FrontmatterModel";
import { StepSettings } from "zettelkasten";
import { ContentDTO } from "application/notes/model/ContentDTO";
import { ObsidianConfig } from "./ObsidianConfig";

export class FrontmatterService {
    public static FRONTMATTER_SETTINGS_KEY = "zettelFlowSettings";
    private metadata: CachedMetadata;
    public static instance(file: TFile) {
        return new FrontmatterService(file);
    }

    constructor(private file: TFile) {
        const metadataAux = ObsidianApi.metadataCache().getFileCache(file);
        if (!metadataAux) {
            this.metadata = {
                frontmatter: {}
            }
        } else {
            this.metadata = metadataAux;
        }
    }

    public contains(property: string): boolean {
        if (!this.metadata.frontmatter) {
            return false;
        }
        return this.metadata.frontmatter[property] !== undefined;
    }

    public equals(property: string, value: Literal): boolean {
        if (!this.metadata.frontmatter) {
            return false;
        }
        return this.getAnidatedProperty(property) === value;
    }

    public getProperty(property: string): Literal {
        return this.getAnidatedProperty(property);
    }

    public get() {
        return this.metadata;
    }

    public getZettelFlowSettings(): StepSettings {
        return this.getProperty(FrontmatterService.FRONTMATTER_SETTINGS_KEY) as StepSettings;
    }

    public async setZettelFlowSettings(settings: StepSettings) {
        await ObsidianApi.fileManager().processFrontMatter(this.file, (frontmatter) => {
            frontmatter[FrontmatterService.FRONTMATTER_SETTINGS_KEY] = settings;
        });
    }

    public getFrontmatter() {
        const frontmatter = this.metadata.frontmatter;
        if (!frontmatter) {
            return {};
        }
        // return all properties except zettelFlowSettings
        const { zettelFlowSettings, ...rest } = frontmatter;
        return rest;
    }

    public async getContent() {
        const rawContent = await ObsidianApi.vault().read(this.file);
        const end = this.metadata.frontmatterPosition?.end?.line;
        const content = rawContent.split("\n").slice(end ? end + 1 : 0).join("\n")
        if (!content) {
            return "";
        }
        return content.concat("\n");
    }

    public async processFrontMatter(content: ContentDTO) {
        const typeMap = await ObsidianConfig.getTypes();
        await ObsidianApi.fileManager().processFrontMatter(this.file, (frontmatter) => {
            if (content.hasTags()) {
                frontmatter.tags = content.getTags();
            }
            Object.entries(content.getFrontmatter()).forEach(([key, value]) => {
                frontmatter[key] = ObsidianConfig.parseType(value, typeMap[key]);
            });
        }).catch((error) => {
            const message = `Error while processing frontmatter: ${error}`;
            log.error(message);
            throw new Error(message);
        });
    }

    public async removeStepSettings() {
        await ObsidianApi.fileManager().processFrontMatter(this.file, (frontmatter) => {
            delete frontmatter[FrontmatterService.FRONTMATTER_SETTINGS_KEY];
        });
    }

    private getAnidatedProperty(property: string): Literal {
        let valueToCheck = { ...this.metadata.frontmatter };
        const anidatedProperty = property.split(".");
        while (valueToCheck && anidatedProperty.length > 0) {
            const propertyAux = anidatedProperty.shift();
            if (propertyAux) {
                valueToCheck = valueToCheck[propertyAux];
            }
        }
        return valueToCheck;
    }
}
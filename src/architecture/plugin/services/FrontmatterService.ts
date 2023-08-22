import { ObsidianApi } from "architecture";
import { CachedMetadata, TFile } from "obsidian";
import { Literal } from "../model/FrontmatterModel";
export class FrontmatterService {
    private metadata: CachedMetadata;
    public static instance(file: TFile) {
        return new FrontmatterService(file);
    }

    constructor(file: TFile) {
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

    public getZettelFlowSettings() {
        return this.getProperty("zettelFlowSettings");
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
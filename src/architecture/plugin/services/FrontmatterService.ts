import { ObsidianApi, log } from "architecture";
import { CachedMetadata, FrontMatterCache, TFile } from "obsidian";
import { Literal } from "../model/FrontmatterModel";
import { StepSettings } from "zettelkasten";
import { ContentDTO } from "application/notes/model/ContentDTO";
import { ObsidianConfig } from "./ObsidianConfig";
import { ObsidianNativeTypesManager } from "./ObsidianNativeTypesManager";

/**
 * Service to manage frontmatter metadata in Obsidian notes.
 */
export class FrontmatterService {
    public static FRONTMATTER_SETTINGS_KEY = "zettelFlowSettings";
    private metadata: CachedMetadata;

    /**
     * Creates an instance of FrontmatterService.
     * @param {TFile} file - The file to retrieve metadata from.
     */
    constructor(private file: TFile) {
        this.metadata = ObsidianApi.metadataCache().getFileCache(file) || { frontmatter: {} };
    }

    /**
     * Factory method to create an instance.
     * @param {TFile} file - The file to retrieve metadata from.
     * @returns {FrontmatterService}
     */
    public static instance(file: TFile): FrontmatterService {
        return new FrontmatterService(file);
    }

    /**
     * Checks if the frontmatter contains a specific property.
     * @param {string} property - The property to check.
     * @returns {boolean}
     */
    public contains(property: string): boolean {
        return !!this.metadata.frontmatter?.[property];
    }

    /**
     * Compares a property value with the given value.
     * @param {string} property - The property name.
     * @param {Literal} value - The expected value.
     * @returns {boolean}
     */
    public equals(property: string, value: Literal): boolean {
        return this.getAnidatedProperty(property) === value;
    }

    /**
     * Retrieves a specific frontmatter property.
     * @param {string} property - The property name.
     * @returns {Literal}
     */
    public getProperty(property: string): Literal {
        return this.getAnidatedProperty(property);
    }

    /**
     * Retrieves a specific frontmatter property as a string.
     * @param {string} property - The property name.
     */
    public async setProperty(property: string, value: Literal): Promise<void> {
        await this.processFrontMatter(frontmatter => {
            frontmatter[property] = value;
        });
    }

    /**
     * Sets multiple properties in the frontmatter.
     * @param {Record<string, Literal>} properties - The properties to set.
     */
    public async setProperties(properties: Record<string, Literal>, toRemove: string[] = []): Promise<void> {
        await this.processFrontMatter(frontmatter => {
            // Add or update properties
            Object.entries(properties).forEach(([key, value]) => {
                frontmatter[key] = value;
            });

            // Remove specified properties
            toRemove.forEach(key => {
                delete frontmatter[key];
            });
        });
    }

    /**
     * Retrieves the entire frontmatter metadata.
     * @returns {CachedMetadata}
     */
    public get(): CachedMetadata {
        return this.metadata;
    }

    /**
     * Checks if the ZettelFlow settings exist.
     * @returns {boolean}
     */
    public hasZettelFlowSettings(): boolean {
        return this.contains(FrontmatterService.FRONTMATTER_SETTINGS_KEY);
    }

    /**
     * Retrieves the ZettelFlow settings.
     * @returns {StepSettings}
     */
    public getZettelFlowSettings(): StepSettings {
        return (this.getProperty(FrontmatterService.FRONTMATTER_SETTINGS_KEY) as StepSettings) || {
            label: this.file.basename,
            actions: [],
            childrenHeader: "",
            root: false,
        };
    }

    /**
     * Updates the ZettelFlow settings.
     * @param {StepSettings} settings - The new settings to apply.
     */
    public async setZettelFlowSettings(settings: StepSettings): Promise<void> {
        await this.processFrontMatter(frontmatter => {
            frontmatter[FrontmatterService.FRONTMATTER_SETTINGS_KEY] = settings;
        });
    }

    /**
     * Retrieves the frontmatter excluding ZettelFlow settings.
     * @returns {Partial<FrontMatterCache>}
     */
    public getFrontmatter(): Partial<FrontMatterCache> {
        const { [FrontmatterService.FRONTMATTER_SETTINGS_KEY]: _unused, ...rest } = this.metadata.frontmatter || {};
        return rest;
    }

    /**
     * Retrieves the entire frontmatter.
     * @returns {Partial<FrontMatterCache>}
     */
    public getAllFrontmatter(): Partial<FrontMatterCache> {
        return this.metadata.frontmatter || {};
    }

    /**
     * Retrieves the note's content excluding the frontmatter.
     * @returns {Promise<string>}
     */
    public async getContent(): Promise<string> {
        const rawContent = await ObsidianApi.vault().read(this.file);
        const endLine = this.metadata.frontmatterPosition?.end?.line;
        return rawContent.split("\n").slice(endLine ? endLine + 1 : 0).join("\n").concat("\n");
    }

    /**
     * Processes and updates the frontmatter with the content metadata.
     * @param {ContentDTO} content - The content to update.
     */
    public async processTypedFrontMatter(content: ContentDTO): Promise<void> {
        try {
            const typeMap = await ObsidianNativeTypesManager.getTypes();
            await this.processFrontMatter(frontmatter => {
                if (content.hasTags()) {
                    frontmatter.tags = content.getTags();
                }
                Object.entries(content.getFrontmatter()).forEach(([key, value]) => {
                    frontmatter[key] = ObsidianConfig.parseType(value, typeMap[key]);
                });
            });
        } catch (error) {
            log.error(`Error processing frontmatter: ${error}`);
            throw new Error(`Error processing frontmatter: ${error}`);
        }
    }

    /**
     * Removes ZettelFlow settings from the frontmatter.
     */
    public async removeStepSettings(): Promise<void> {
        await this.processFrontMatter(frontmatter => {
            delete frontmatter[FrontmatterService.FRONTMATTER_SETTINGS_KEY];
        });
    }

    /**
     * Helper method to safely process frontmatter modifications.
     * @param {(frontmatter: any) => void} updateFn - The function that modifies the frontmatter.
     */
    private async processFrontMatter(updateFn: (frontmatter: any) => void): Promise<void> {
        try {
            await ObsidianApi.fileManager().processFrontMatter(this.file, updateFn);
        } catch (error) {
            log.error(`Error processing frontmatter: ${error}`);
            throw new Error(`Error processing frontmatter: ${error}`);
        }
    }

    /**
     * Retrieves a nested property from the frontmatter.
     * @param {string} property - The nested property path.
     * @returns {Literal}
     */
    private getAnidatedProperty(property: string): Literal {
        return property.split(".").reduce((acc, key) => acc?.[key], this.metadata.frontmatter) || undefined;
    }
}

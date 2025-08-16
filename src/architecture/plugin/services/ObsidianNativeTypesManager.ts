import { c, ObsidianApi } from "architecture";

export class ObsidianNativeTypesManager {
    /**
     * List of available types that can be used in Obsidian.
     * @type {string[]}
     */
    public static readonly AVAILABLE_TYPES = [
        "text",
        "multitext",
        "number",
        "checkbox",
        "date",
        "datetime",
        "aliases",
        "tags"
    ];

    /**
     * Returns the icon associated with a given type.
     * @param {string} type - The type for which to get the icon.
     * @returns {string} The icon name.
     */
    public static getIconForType(type: string): string {
        switch (type) {
            case "text":
                return "text";
            case "number":
                return "binary";
            case "date":
                return "calendar";
            case "datetime":
                return "clock";
            case "multitext":
                return "list";
            case "checkbox":
                return "check-square";
            case "aliases":
                return "forward";
            case "tags":
                return "tags";
            default:
                return "file-question";
        }
    }

    /**
     * Retrieves all native types defined in the Obsidian configuration.
     * @returns {Promise<Record<string, string>>} A promise that resolves to an object containing type names and their values.
     */
    public static async getTypes(): Promise<Record<string, string>> {
        const typesFilePath = `${ObsidianApi.vault().configDir}/types.json`;
        // Check if file exists
        if (!await ObsidianApi.vault().adapter.exists(typesFilePath)) {
            return {};
        }
        return JSON.parse(await ObsidianApi.vault().adapter.read(typesFilePath)).types;
    }

    /**
     * Adds a new type to the Obsidian configuration.
     * @param {string} typeName - The name of the type to add.
     * @param {string} typeValue - The value of the type to add.
     * @returns {Promise<void>}
     */
    public static async addType(typeName: string, typeValue: string): Promise<void> {
        const types = await this.getTypes();
        if (types[typeName]) {
            throw new Error(`Type ${typeName} already exists.`);
        }
        types[typeName] = typeValue;
        await ObsidianApi.vault().adapter.write(
            `${ObsidianApi.vault().configDir}/types.json`,
            JSON.stringify({ types }, null, 2)
        );
    }

    /**
     * Removes a type from the Obsidian configuration.
     * @param {string} typeName - The name of the type to remove.
     * @returns {Promise<void>}
     */
    public static async removeType(typeName: string): Promise<void> {
        const types = await this.getTypes();
        if (!types[typeName]) {
            throw new Error(`Type ${typeName} does not exist.`);
        }
        delete types[typeName];
        await ObsidianApi.vault().adapter.write(
            `${ObsidianApi.vault().configDir}/types.json`,
            JSON.stringify({ types }, null, 2)
        );
    }

    /**
     * Updates an existing type in the Obsidian configuration.
     * @param {string} typeName - The name of the type to update.
     * @param {string} newTypeValue - The new value for the type.
     * @returns {Promise<void>}
     */
    public static async updateType(typeName: string, newTypeValue: string): Promise<void> {
        const types = await this.getTypes();
        if (!types[typeName]) {
            throw new Error(`Type ${typeName} does not exist.`);
        }
        types[typeName] = newTypeValue;
        await ObsidianApi.vault().adapter.write(
            `${ObsidianApi.vault().configDir}/types.json`,
            JSON.stringify({ types }, null, 2)
        );
    }
}